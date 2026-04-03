"""
Workshops router — CRUD and deployment for workshop deployments.
"""
import asyncio
import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

import config as cfg
from auth import get_credentials
from services import firestore_client as fs
from services.gcp_compute import GCPComputeService
from services.fs_api import FabricStudioClient, wait_until_ready
from services.instance_naming import InstanceName
from services.dns_helpers import create_dns_for_instance, delete_dns_for_instance
from services.parallel_runner import job_manager

_APP_MODE = os.environ.get("APP_MODE", "full")

router = APIRouter(prefix="/workshops", tags=["workshops"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WorkshopCreate(BaseModel):
    name: str
    passphrase: str
    guest_password: str
    hostname_template: str = ""
    fabric_workspace: str = ""
    doc_link: str = ""
    source_image: str
    machine_type: str
    zone: str
    count_start: int = 1
    count_end: int = 1
    start_time: str | None = None
    end_time: str | None = None


class WorkshopUpdate(BaseModel):
    name: str | None = None
    passphrase: str | None = None
    guest_password: str | None = None
    hostname_template: str | None = None
    fabric_workspace: str | None = None
    doc_link: str | None = None
    source_image: str | None = None
    machine_type: str | None = None
    zone: str | None = None
    count_start: int | None = None
    count_end: int | None = None
    start_time: str | None = None
    end_time: str | None = None
    status: str | None = None
    portal_enabled: bool | None = None
    portal_url: str | None = None
    current_activity: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_project() -> str:
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    return project_id


# ---------------------------------------------------------------------------
# Workshop CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_workshops():
    project_id = _require_project()
    return await fs.list_workshops(project_id=project_id)


@router.post("", status_code=201)
async def create_workshop(body: WorkshopCreate):
    project_id = _require_project()
    data = {
        **body.model_dump(),
        "project_id": project_id,
        "status": "draft",
        "portal_enabled": False,
        "portal_url": None,
        "current_activity": None,
    }
    return await fs.create_workshop(data)


@router.get("/{workshop_id}")
async def get_workshop(workshop_id: str):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return workshop


@router.put("/{workshop_id}")
async def update_workshop(workshop_id: str, body: WorkshopUpdate):
    _require_project()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await fs.update_workshop(workshop_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return result


@router.delete("/{workshop_id}", status_code=204)
async def delete_workshop(workshop_id: str):
    _require_project()
    deleted = await fs.delete_workshop(workshop_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workshop not found.")


# ---------------------------------------------------------------------------
# Attendees
# ---------------------------------------------------------------------------

@router.get("/{workshop_id}/attendees")
async def list_attendees(workshop_id: str):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return await fs.list_attendees(workshop_id)


@router.delete("/{workshop_id}/attendees/{attendee_id}", status_code=204)
async def remove_attendee(workshop_id: str, attendee_id: str):
    _require_project()
    deleted = await fs.delete_attendee(workshop_id, attendee_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Attendee not found.")


# ---------------------------------------------------------------------------
# Deployment helpers
# ---------------------------------------------------------------------------

def _get_compute() -> GCPComputeService:
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


async def _resolve_host(zone: str, instance_name: str) -> str:
    svc = _get_compute()
    instance = await svc.get_instance(zone=zone, name=instance_name)
    if _APP_MODE == "backend":
        if instance.internal_ip:
            return instance.internal_ip
    else:
        if instance.public_ip:
            return instance.public_ip
    raise RuntimeError(f"Instance {instance_name} has no suitable IP address")


async def _workshop_deploy_job(job_id: str, workshop_id: str) -> None:
    """Full deployment: clone instances → configure → mark running."""
    q = job_manager.jobs[job_id]
    failed = False

    async def activity(msg: str) -> None:
        await q.put(msg)
        await fs.update_workshop(workshop_id, {"current_activity": msg})

    try:
        workshop = await fs.get_workshop(workshop_id)
        if not workshop:
            await activity("ERROR: Workshop not found.")
            await job_manager.mark_done(job_id, failed=True)
            return

        project_id = cfg.settings.active_project_id
        pc = cfg.get_project_config(cfg.settings, project_id)
        svc = _get_compute()

        source_name = workshop["source_image"]
        zone = workshop["zone"]
        name = workshop["name"]
        count_start = int(workshop["count_start"])
        count_end = int(workshop["count_end"])
        guest_password = workshop.get("guest_password", "")
        hostname_template = workshop.get("hostname_template", "")
        fabric_workspace = workshop.get("fabric_workspace", "")

        # Derive base name: use the source instance prefix + workshop name
        try:
            source_parsed = InstanceName.parse(source_name)
            base_name = f"{source_parsed.type}-{source_parsed.prepend}-{name}"
        except Exception:
            base_name = name

        numbers = list(range(count_start, count_end + 1))
        total = len(numbers)
        instance_names = [f"{base_name}-{n:03d}" for n in numbers]

        # ── Step 1: Clone ────────────────────────────────────────────
        await activity(f"Creating machine image from {source_name}…")
        machine_image_name = f"{base_name}-tmp-{uuid.uuid4().hex[:8]}"
        try:
            await svc.create_machine_image(
                source_name=source_name,
                name=machine_image_name,
                zone=zone,
            )
        except Exception as exc:
            await activity(f"ERROR creating machine image: {exc}")
            await fs.update_workshop(workshop_id, {"status": "draft"})
            await job_manager.mark_done(job_id, failed=True)
            return

        batch_size = 5
        for batch_start in range(0, total, batch_size):
            batch = numbers[batch_start: batch_start + batch_size]
            await activity(f"Creating instances {batch[0]}–{batch[-1]} of {total}…")

            async def create_one(number: int) -> None:
                inst_name = f"{base_name}-{number:03d}"
                await activity(f"Creating {inst_name}…")
                await svc.create_instance_from_machine_image(
                    name=inst_name,
                    machine_image=machine_image_name,
                    zone=zone,
                )
                labels = {"delete": "yes", "group": name}
                if pc.get("owner"):
                    labels["purpose"] = "workshop"
                await svc.add_labels(zone=zone, name=inst_name, labels=labels)
                await create_dns_for_instance(inst_name, zone, log=q.put)

            results = await asyncio.gather(*[create_one(n) for n in batch], return_exceptions=True)
            for n, result in zip(batch, results):
                if isinstance(result, Exception):
                    await q.put(f"ERROR creating {base_name}-{n:03d}: {result}")
                    failed = True

        # Clean up machine image
        try:
            await svc.delete_machine_image(machine_image_name)
        except Exception:
            pass

        if failed:
            await fs.update_workshop(workshop_id, {"status": "draft", "current_activity": "Deployment failed during clone."})
            await job_manager.mark_done(job_id, failed=True)
            return

        # ── Step 2: Configure ────────────────────────────────────────
        await activity(f"Configuring {total} instance(s)…")
        admin_password = pc.get("fs_admin_password", "")

        workspace_fabrics = []
        if fabric_workspace:
            workspace_fabrics = [{"name": fabric_workspace, "template_name": fabric_workspace, "install": True}]

        configure_failures: list[str] = []

        async def configure_one(inst_name: str) -> None:
            tag = f"[{inst_name}]"
            try:
                host = await _resolve_host(zone, inst_name)
            except RuntimeError as exc:
                await q.put(f"{tag} ERROR: {exc}")
                configure_failures.append(inst_name)
                return

            async def log(msg: str) -> None:
                await q.put(f"{tag} {msg}")

            try:
                await wait_until_ready(host, log=log)
                async with FabricStudioClient(host, admin_password) as fsc:
                    if guest_password:
                        await log("Setting guest password…")
                        await fsc.change_user_password("guest", guest_password)
                    if hostname_template:
                        try:
                            parsed = InstanceName.parse(inst_name)
                            count = parsed.number
                        except Exception:
                            count = 0
                        hostname = hostname_template.replace("{count}", str(count))
                        await log(f"Setting hostname to '{hostname}'…")
                        await fsc.set_hostname(hostname)
                    if workspace_fabrics:
                        await log("Setting up Fabric Workspace…")
                        await fsc.uninstall_fabric()
                        await fsc.wait_for_tasks()
                        await fsc.delete_all_fabrics()
                        available = await fsc.list_templates()
                        template_map = {t["name"]: t["id"] for t in available}
                        for fabric in workspace_fabrics:
                            tpl_name = fabric["template_name"]
                            local_id = template_map.get(tpl_name)
                            if local_id is None:
                                raise ValueError(f"Template '{tpl_name}' not found")
                            await fsc.create_fabric(fabric["name"], local_id)
                            await fsc.wait_for_tasks()
                        fabric_to_install = next((f for f in workspace_fabrics if f.get("install")), None)
                        if fabric_to_install:
                            fabric_id = await fsc.get_fabric_id_by_name(fabric_to_install["name"])
                            await fsc.install_fabric(fabric_id)
                await log("Done.")
            except Exception as exc:
                await q.put(f"{tag} ERROR: {exc}")
                configure_failures.append(inst_name)

        await asyncio.gather(*[configure_one(n) for n in instance_names], return_exceptions=True)

        if configure_failures:
            failed = True

        if failed:
            await fs.update_workshop(workshop_id, {"status": "draft", "current_activity": "Deployment failed during configure."})
            await job_manager.mark_done(job_id, failed=True)
            return

        # ── Done ─────────────────────────────────────────────────────
        await fs.update_workshop(workshop_id, {"status": "running", "current_activity": "Workshop is live."})
        await q.put("Workshop is live.")
        await job_manager.mark_done(job_id)

    except Exception as exc:
        await q.put(f"ERROR: {exc}")
        await fs.update_workshop(workshop_id, {"status": "draft", "current_activity": f"Deployment failed: {exc}"})
        await job_manager.mark_done(job_id, failed=True)


async def _workshop_teardown_job(job_id: str, workshop_id: str) -> None:
    """Teardown: delete all workshop instances."""
    q = job_manager.jobs[job_id]

    async def activity(msg: str) -> None:
        await q.put(msg)
        await fs.update_workshop(workshop_id, {"current_activity": msg})

    try:
        workshop = await fs.get_workshop(workshop_id)
        if not workshop:
            await job_manager.mark_done(job_id, failed=True)
            return

        svc = _get_compute()
        zone = workshop["zone"]
        name = workshop["name"]
        count_start = int(workshop["count_start"])
        count_end = int(workshop["count_end"])

        try:
            source_parsed = InstanceName.parse(workshop["source_image"])
            base_name = f"{source_parsed.type}-{source_parsed.prepend}-{name}"
        except Exception:
            base_name = name

        instance_names = [f"{base_name}-{n:03d}" for n in range(count_start, count_end + 1)]
        total = len(instance_names)
        await activity(f"Deleting {total} instance(s)…")

        failed = False

        async def delete_one(inst_name: str) -> None:
            await q.put(f"Deleting {inst_name}…")
            try:
                await svc.delete_instance(zone=zone, name=inst_name)
                await delete_dns_for_instance(inst_name, log=q.put)
            except Exception as exc:
                await q.put(f"ERROR deleting {inst_name}: {exc}")

        results = await asyncio.gather(*[delete_one(n) for n in instance_names], return_exceptions=True)
        for inst_name, result in zip(instance_names, results):
            if isinstance(result, Exception):
                await q.put(f"ERROR on {inst_name}: {result}")
                failed = True

        await fs.update_workshop(workshop_id, {
            "status": "ended",
            "current_activity": "Workshop ended." if not failed else "Teardown completed with errors.",
        })
        await job_manager.mark_done(job_id, failed=failed)

    except Exception as exc:
        await q.put(f"ERROR: {exc}")
        await fs.update_workshop(workshop_id, {"current_activity": f"Teardown failed: {exc}"})
        await job_manager.mark_done(job_id, failed=True)


# ---------------------------------------------------------------------------
# Start / Stop endpoints
# ---------------------------------------------------------------------------

@router.post("/{workshop_id}/start")
async def start_workshop(workshop_id: str, background_tasks: BackgroundTasks):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    if workshop["status"] not in ("draft", "ended"):
        raise HTTPException(status_code=400, detail=f"Cannot start a workshop with status '{workshop['status']}'.")

    await fs.update_workshop(workshop_id, {"status": "deploying", "current_activity": "Starting deployment…"})
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_workshop_deploy_job, job_id, workshop_id)
    return {"job_id": job_id}


@router.post("/{workshop_id}/stop")
async def stop_workshop(workshop_id: str, background_tasks: BackgroundTasks):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    if workshop["status"] not in ("running", "deploying"):
        raise HTTPException(status_code=400, detail=f"Cannot stop a workshop with status '{workshop['status']}'.")

    await fs.update_workshop(workshop_id, {"current_activity": "Stopping workshop…"})
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_workshop_teardown_job, job_id, workshop_id)
    return {"job_id": job_id}
