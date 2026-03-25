import asyncio
import uuid
from datetime import datetime, timedelta
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from models.instance import BuildConfig, BulkConfigureItem, BulkConfigureRequest, CloneRequest, ConfigureRequest
from services.fs_api import FabricStudioClient, wait_until_ready
from services.dns_helpers import create_dns_for_instance, delete_dns_for_instance
from services.gcp_compute import GCPComputeService
from services.gcp_dns import GCPDnsService
from services.instance_naming import InstanceName
from services.parallel_runner import job_manager

router = APIRouter(prefix="/ops", tags=["operations"])


class BulkInstanceItem(BaseModel):
    zone: str
    name: str


class BulkRequest(BaseModel):
    instances: list[BulkInstanceItem]


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


# ------------------------------------------------------------------ #
#  Build                                                               #
# ------------------------------------------------------------------ #

async def _build_job(job_id: str, build_cfg: BuildConfig) -> None:
    q = job_manager.jobs[job_id]
    svc = _get_service()
    failed = False

    try:
        instance_type = cfg.settings.default_type or "fs"
        count_start = build_cfg.count_start
        count_end = build_cfg.count_end
        names = []
        for n in range(count_start, count_end + 1):
            inst_name = InstanceName.from_parts(
                type=instance_type,
                prepend=build_cfg.prepend,
                product=build_cfg.product,
                number=n,
            ).to_string()
            names.append(inst_name)

        await q.put(f"Starting build of {len(names)} instance(s): {', '.join(names)}")

        subnetwork = await svc.get_subnetwork_for_zone(build_cfg.zone)

        labels = dict(build_cfg.labels)
        if build_cfg.group:
            labels["group"] = build_cfg.group
        if cfg.settings.owner:
            labels["owner"] = cfg.settings.owner
        if build_cfg.title:
            labels["title"] = build_cfg.title
        labels["purpose"] = "golden_image"
        labels["expire"] = (datetime.now() + timedelta(days=365)).strftime("%d-%m-%Y")

        async def build_one(name: str) -> None:
            await q.put(f"Building instance: {name}")
            await svc.build_instance(
                name=name,
                zone=build_cfg.zone,
                machine_type=build_cfg.machine_type,
                image=build_cfg.image,
                trial_key=build_cfg.trial_key,
                labels=labels,
                tags=["workshop-source-any", "workshop-source-networks"],
                poc_definitions=build_cfg.poc_definitions,
                poc_launch=build_cfg.poc_launch,
                license_server=build_cfg.license_server or cfg.settings.license_server,
                subnetwork=subnetwork,
            )
            await q.put(f"Instance {name} created successfully")
            await create_dns_for_instance(name, build_cfg.zone, log=q.put)

        tasks = [build_one(name) for name in names]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for name, result in zip(names, results):
            if isinstance(result, Exception):
                await q.put(f"ERROR building {name}: {result}")
                failed = True

    except Exception as exc:
        await q.put(f"Build job failed: {exc}")
        failed = True

    await job_manager.mark_done(job_id, failed=failed)


@router.post("/build")
async def build_instances(build_cfg: BuildConfig, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_build_job, job_id, build_cfg)
    return {"job_id": job_id}


# ------------------------------------------------------------------ #
#  Clone                                                               #
# ------------------------------------------------------------------ #

async def _clone_job(job_id: str, clone_req: CloneRequest) -> None:
    q = job_manager.jobs[job_id]
    svc = _get_service()
    failed = False

    try:
        # Parse the source name to determine base_name
        try:
            source_inst = InstanceName.parse(clone_req.source_name)
        except ValueError as exc:
            await q.put(f"Invalid source name: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        if clone_req.clone_base_name:
            base_name = f"{source_inst.type}-{source_inst.prepend}-{clone_req.clone_base_name}"
        else:
            base_name = source_inst.base_name
        count_start = clone_req.count_start
        count_end = clone_req.count_end


        numbers = list(range(count_start, count_end + 1))
        total = len(numbers)

        target_zone = clone_req.target_zone or clone_req.zone
        cross_zone = target_zone != clone_req.zone

        await q.put(
            f"Cloning {total} instance(s) from {clone_req.source_name} "
            f"({'cross-zone: ' + clone_req.zone + ' → ' + target_zone if cross_zone else 'zone: ' + clone_req.zone})"
        )

        # Process in batches of 5
        batch_size = 5
        for batch_idx, i in enumerate(range(0, total, batch_size)):
            batch_numbers = numbers[i : i + batch_size]
            machine_image_name = f"{base_name}-tmp-{uuid.uuid4().hex[:8]}"

            await q.put(
                f"Batch {batch_idx + 1}: creating machine image '{machine_image_name}' "
                f"from {clone_req.source_name}"
            )

            try:
                # Delete the machine image first if it already exists (mirrors CLI behaviour)
                try:
                    await svc.delete_machine_image(name=machine_image_name)
                    await q.put(f"Removed existing machine image '{machine_image_name}'")
                except Exception:
                    pass  # Didn't exist — that's fine

                await svc.create_machine_image(
                    name=machine_image_name,
                    source_instance=clone_req.source_name,
                    source_zone=clone_req.zone,  # always the source zone
                )
                await q.put(f"Machine image '{machine_image_name}' created")
            except Exception as exc:
                await q.put(f"ERROR creating machine image: {exc}")
                failed = True
                continue

            # Create all instances in this batch in parallel
            async def create_one(number: int, img_name: str = machine_image_name) -> None:
                inst_name = f"{base_name}-{number:03d}"
                # Check if instance already exists in target zone
                existing = None
                try:
                    existing = await svc.get_instance(zone=target_zone, name=inst_name)
                except Exception:
                    pass

                if existing is not None:
                    if (existing.labels or {}).get("delete") == "no":
                        await q.put(f"Skipping {inst_name} — protected (label delete=no)")
                        return
                    if clone_req.overwrite:
                        await q.put(f"Deleting existing instance {inst_name}")
                        await svc.delete_instance(zone=target_zone, name=inst_name)
                        await svc.wait_until_deleted(zone=target_zone, name=inst_name)
                    else:
                        await q.put(f"Skipping {inst_name} — already exists")
                        return

                await q.put(f"Creating instance {inst_name} from {img_name}")
                await svc.create_instance_from_machine_image(
                    name=inst_name,
                    machine_image=img_name,
                    zone=target_zone,
                )
                labels = {"delete": "yes"}
                if clone_req.purpose:
                    labels["purpose"] = clone_req.purpose
                await svc.add_labels(zone=target_zone, name=inst_name, labels=labels)
                await q.put(f"Instance {inst_name} created")

                # Create DNS A record if configured
                await create_dns_for_instance(inst_name, target_zone, log=q.put)

            tasks = [create_one(n) for n in batch_numbers]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for n, result in zip(batch_numbers, results):
                if isinstance(result, Exception):
                    await q.put(f"ERROR creating {base_name}-{n:03d}: {result}")
                    failed = True

            # Clean up the machine image after the batch
            try:
                await svc.delete_machine_image(name=machine_image_name)
                await q.put(f"Machine image '{machine_image_name}' deleted")
            except Exception as exc:
                await q.put(f"WARNING: failed to delete machine image '{machine_image_name}': {exc}")

    except Exception as exc:
        await q.put(f"Clone job failed: {exc}")
        failed = True

    await job_manager.mark_done(job_id, failed=failed)


@router.post("/clone")
async def clone_instances(clone_req: CloneRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_clone_job, job_id, clone_req)
    return {"job_id": job_id}


# ------------------------------------------------------------------ #
#  Configure                                                           #
# ------------------------------------------------------------------ #

def _build_instance_fqdn(product: str) -> str | None:
    """Return the FQDN for the golden image (number=0) of a workshop."""
    prefix = cfg.settings.instance_fqdn_prefix
    domain = cfg.settings.dns_domain
    if not prefix or not domain:
        return None
    return f"{prefix}0.{product}.{domain}"


async def _configure_job(job_id: str, req: ConfigureRequest) -> None:
    q = job_manager.jobs[job_id]
    failed = False

    try:
        fqdn = _build_instance_fqdn(req.product)
        if not fqdn:
            await q.put("ERROR: DNS settings (Instance FQDN prefix / DNS Domain) are not configured in Settings.")
            await job_manager.mark_done(job_id, failed=True)
            return

        default_password = req.old_admin_password or cfg.settings.fs_admin_password
        if not default_password:
            await q.put("ERROR: No admin password available — set a default in Settings or fill in the Old admin password field.")
            await job_manager.mark_done(job_id, failed=True)
            return

        await q.put(f"Waiting for Fabric Studio instance at {fqdn} to be ready…")
        try:
            await wait_until_ready(fqdn, log=q.put)
        except TimeoutError as exc:
            await q.put(f"ERROR: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        await q.put(f"Connecting to Fabric Studio instance at {fqdn}…")

        try:
            async with FabricStudioClient(fqdn, default_password) as fs:
                # Set license server
                if req.license_server:
                    await q.put(f"Setting license server to https://{req.license_server}/license/…")
                    await fs.set_license_server(req.license_server)
                    await q.put("License server configured.")

                # Register token:secret
                if req.trial_key:
                    await q.put("Registering token…")
                    await fs.register_token(req.trial_key)
                    await q.put("Registration token applied.")

                # Change admin password (last — session uses old password)
                if req.admin_password:
                    await q.put("Changing admin password…")
                    await fs.change_admin_password(
                        current_password=default_password,
                        new_password=req.admin_password,
                    )
                    await q.put("Admin password changed successfully.")
        except Exception as exc:
            await q.put(f"ERROR during configure: {exc}")
            failed = True

    except Exception as exc:
        await q.put(f"Configure job failed: {exc}")
        failed = True

    await job_manager.mark_done(job_id, failed=failed)


@router.post("/configure")
async def configure_instance(req: ConfigureRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_configure_job, job_id, req)
    return {"job_id": job_id}


# ------------------------------------------------------------------ #
#  Bulk operations                                                      #
# ------------------------------------------------------------------ #

async def _bulk_op_job(
    job_id: str, instances: list[BulkInstanceItem], operation: str
) -> None:
    q = job_manager.jobs[job_id]
    svc = _get_service()
    failed = False

    await q.put(f"Starting bulk {operation} for {len(instances)} instance(s)")

    async def op_one(item: BulkInstanceItem) -> None:
        await q.put(f"{operation.capitalize()}ing {item.name}...")
        if operation == "start":
            await svc.start_instance(zone=item.zone, name=item.name)
            await q.put(f"{item.name}: {operation} completed")
            await create_dns_for_instance(item.name, item.zone, log=q.put)
        elif operation == "stop":
            await svc.stop_instance(zone=item.zone, name=item.name)
            await q.put(f"{item.name}: {operation} completed")
            await delete_dns_for_instance(item.name, log=q.put)
        elif operation == "delete":
            await svc.delete_instance(zone=item.zone, name=item.name)
            await q.put(f"{item.name}: {operation} completed")
            await delete_dns_for_instance(item.name, log=q.put)

    tasks = [op_one(item) for item in instances]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for item, result in zip(instances, results):
        if isinstance(result, Exception):
            await q.put(f"ERROR on {item.name}: {result}")
            failed = True

    await job_manager.mark_done(job_id, failed=failed)


@router.post("/bulk-start")
async def bulk_start(body: BulkRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_bulk_op_job, job_id, body.instances, "start")
    return {"job_id": job_id}


@router.post("/bulk-stop")
async def bulk_stop(body: BulkRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_bulk_op_job, job_id, body.instances, "stop")
    return {"job_id": job_id}


@router.post("/bulk-delete")
async def bulk_delete(body: BulkRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_bulk_op_job, job_id, body.instances, "delete")
    return {"job_id": job_id}


# ------------------------------------------------------------------ #
#  Bulk configure                                                      #
# ------------------------------------------------------------------ #

async def _bulk_configure_job(job_id: str, req: BulkConfigureRequest) -> None:
    q = job_manager.jobs[job_id]
    failures: list[str] = []

    default_password = req.old_admin_password or cfg.settings.fs_admin_password
    if not default_password:
        await q.put("ERROR: No admin password available — set a default in Settings or fill in the Admin password field.")
        await job_manager.mark_done(job_id, failed=True)
        return

    prefix = cfg.settings.instance_fqdn_prefix
    domain = cfg.settings.dns_domain
    if not prefix or not domain:
        await q.put("ERROR: DNS settings (Instance FQDN prefix / DNS Domain) are not configured in Settings.")
        await job_manager.mark_done(job_id, failed=True)
        return

    await q.put(f"Starting configure for {len(req.instances)} instance(s)…")

    async def configure_one(item: BulkConfigureItem) -> None:
        tag = f"[{item.name}]"
        try:
            parsed = InstanceName.parse(item.name)
        except ValueError as exc:
            await q.put(f"{tag} ERROR: {exc}")
            failures.append(item.name)
            return

        fqdn = f"{prefix}{parsed.number}.{parsed.product}.{domain}"

        async def log(msg: str) -> None:
            await q.put(f"{tag} {msg}")

        try:
            await wait_until_ready(fqdn, log=log)
        except TimeoutError as exc:
            await q.put(f"{tag} ERROR: {exc}")
            failures.append(item.name)
            return

        await q.put(f"{tag} Connecting to {fqdn}…")
        try:
            async with FabricStudioClient(fqdn, default_password) as fs:
                if req.license_server:
                    await q.put(f"{tag} Setting license server…")
                    await fs.set_license_server(req.license_server)
                if req.trial_key:
                    await q.put(f"{tag} Registering token…")
                    await fs.register_token(req.trial_key)
                if req.admin_password:
                    await q.put(f"{tag} Changing admin password…")
                    await fs.change_admin_password(default_password, req.admin_password)
                if req.guest_password:
                    await q.put(f"{tag} Setting guest password…")
                    await fs.change_user_password("guest", req.guest_password)
                if req.hostname_template:
                    hostname = req.hostname_template.replace("{count}", str(parsed.number))
                    await q.put(f"{tag} Setting hostname to '{hostname}'…")
                    await fs.set_hostname(hostname)
                all_ssh_keys = list(req.ssh_keys)
                if cfg.settings.ssh_public_key:
                    all_ssh_keys.insert(0, cfg.settings.ssh_public_key)
                if all_ssh_keys:
                    await q.put(f"{tag} Setting {len(all_ssh_keys)} SSH key(s)…")
                    if req.delete_existing_keys:
                        await fs.clear_ssh_keys()
                    for key in all_ssh_keys:
                        await fs.add_ssh_key(key)
                    await q.put(f"{tag} SSH keys set.")
            await q.put(f"{tag} Done.")
        except Exception as exc:
            await q.put(f"{tag} ERROR: {exc}")
            failures.append(item.name)

    tasks = [configure_one(item) for item in req.instances]
    await asyncio.gather(*tasks, return_exceptions=True)

    await job_manager.mark_done(job_id, failed=bool(failures))


@router.post("/bulk-configure")
async def bulk_configure(req: BulkConfigureRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_bulk_configure_job, job_id, req)
    return {"job_id": job_id}


# ------------------------------------------------------------------ #
#  SSE streaming                                                        #
# ------------------------------------------------------------------ #

@router.get("/{job_id}/stream")
async def stream_job(job_id: str):
    if job_id not in job_manager.jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        async for chunk in job_manager.stream_job(job_id):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{job_id}/status")
async def get_job_status(job_id: str):
    status = job_manager.status.get(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "status": status}
