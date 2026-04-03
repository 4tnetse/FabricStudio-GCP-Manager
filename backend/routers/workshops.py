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
    workshop = await fs.create_workshop(data)
    if workshop.get("start_time") or workshop.get("end_time"):
        job_names = await _create_workshop_scheduler_jobs(workshop)
        if job_names:
            workshop = await fs.update_workshop(workshop["id"], job_names) or workshop
    return workshop


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

    # Check if times are changing so we can recreate scheduler jobs
    existing = await fs.get_workshop(workshop_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    times_changed = (
        "start_time" in updates and updates["start_time"] != existing.get("start_time")
    ) or (
        "end_time" in updates and updates["end_time"] != existing.get("end_time")
    )

    result = await fs.update_workshop(workshop_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")

    if times_changed:
        await _delete_workshop_scheduler_jobs(existing)
        job_names = await _create_workshop_scheduler_jobs(result)
        if job_names:
            result = await fs.update_workshop(workshop_id, job_names) or result

    return result


@router.delete("/{workshop_id}", status_code=204)
async def delete_workshop(workshop_id: str):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    await _delete_workshop_scheduler_jobs(workshop)
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

        # Write instance_base_name and dns_domain to workshop doc for portal use
        dns_domain = cfg.get_project_config(cfg.settings, project_id).get("dns_domain", "")
        await fs.update_workshop(workshop_id, {
            "instance_base_name": base_name,
            "dns_domain": dns_domain,
        })

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
# Cloud Scheduler helpers for workshop start / stop
# ---------------------------------------------------------------------------


def _workshop_scheduler_job_name(project_id: str, region: str, workshop_id: str, action: str) -> str:
    return f"projects/{project_id}/locations/{region}/jobs/fabricstudio-workshop-{workshop_id[:8]}-{action}"


async def _create_workshop_scheduler_jobs(workshop: dict) -> dict[str, str]:
    """Create Cloud Scheduler jobs for workshop start/stop times.

    Only runs when a Cloud Run backend URL is configured.  Returns a dict of
    field names → job resource names (e.g. ``{"start_scheduler_job": "..."}``).
    """
    project_id = workshop.get("project_id") or cfg.settings.active_project_id
    pc = cfg.get_project_config(cfg.settings, project_id)
    region = pc.get("cloud_run_region", "")
    backend_url = pc.get("remote_backend_url", "")
    if not region or not backend_url:
        return {}

    # Service account email from key store
    sa_email = ""
    try:
        from services.key_store import load_keys
        key_id = cfg.settings.active_key_id or ""
        key_meta = next((k for k in load_keys() if k.id == key_id), None)
        if key_meta:
            sa_email = key_meta.client_email
    except Exception:
        pass
    if not sa_email:
        return {}

    workshop_id = workshop["id"]
    loop = asyncio.get_event_loop()

    def _make_cron_utc(iso_time: str) -> str:
        from datetime import datetime
        dt = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        return f"{dt.minute} {dt.hour} {dt.day} {dt.month} *"

    def _create() -> dict[str, str]:
        from google.cloud import scheduler_v1
        from services.cloud_scheduler import _get_client
        client = _get_client()
        location = f"projects/{project_id}/locations/{region}"
        result: dict[str, str] = {}

        for action in ("start", "stop"):
            time_field = "start_time" if action == "start" else "end_time"
            iso_time = workshop.get(time_field)
            if not iso_time:
                continue
            try:
                cron = _make_cron_utc(iso_time)
            except Exception:
                continue

            full_name = _workshop_scheduler_job_name(project_id, region, workshop_id, action)
            trigger_url = f"{backend_url.rstrip('/')}/api/workshops/{workshop_id}/{action}"

            job = scheduler_v1.Job(
                name=full_name,
                schedule=cron,
                time_zone="UTC",
                http_target=scheduler_v1.HttpTarget(
                    uri=trigger_url,
                    http_method=scheduler_v1.HttpMethod.POST,
                    headers={"Content-Type": "application/json"},
                    body=b"{}",
                    oidc_token=scheduler_v1.OidcToken(
                        service_account_email=sa_email,
                        audience=backend_url,
                    ),
                ),
            )
            try:
                # Delete existing first (idempotent)
                try:
                    client.delete_job(name=full_name)
                except Exception:
                    pass
                created = client.create_job(parent=location, job=job)
                result[f"{action}_scheduler_job"] = created.name
                logger.info("Created workshop scheduler job: %s", created.name)
            except Exception as exc:
                logger.warning("Failed to create workshop scheduler job (%s): %s", action, exc)

        return result

    return await loop.run_in_executor(None, _create)


async def _delete_workshop_scheduler_jobs(workshop: dict) -> None:
    """Delete any Cloud Scheduler jobs attached to a workshop."""
    job_names = [
        workshop.get("start_scheduler_job"),
        workshop.get("stop_scheduler_job"),
    ]
    job_names = [j for j in job_names if j]
    if not job_names:
        return

    loop = asyncio.get_event_loop()

    def _delete() -> None:
        from services.cloud_scheduler import _get_client
        client = _get_client()
        for name in job_names:
            try:
                client.delete_job(name=name)
                logger.info("Deleted workshop scheduler job: %s", name)
            except Exception:
                pass

    await loop.run_in_executor(None, _delete)


# ---------------------------------------------------------------------------
# Portal domain mapping helpers
# ---------------------------------------------------------------------------


def _get_auth_headers(credentials) -> dict[str, str]:
    """Refresh credentials and return Authorization + Content-Type headers."""
    import requests as _req
    from google.auth.transport.requests import Request as _AuthRequest
    if not getattr(credentials, "valid", True):
        try:
            credentials.refresh(_AuthRequest())
        except Exception:
            pass
    token = getattr(credentials, "token", None)
    if not token:
        credentials.refresh(_AuthRequest())
        token = credentials.token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_domain_mapping_sync(credentials, project_id: str, region: str, service_name: str, domain: str) -> dict:
    """Create a Cloud Run v1 domain mapping. Returns the mapping resource."""
    import requests as _req
    headers = _get_auth_headers(credentials)
    base = f"https://run.googleapis.com/v1/projects/{project_id}/locations/{region}/domainmappings"
    body = {
        "metadata": {"name": domain, "namespace": project_id},
        "spec": {"routeName": service_name, "certificateMode": "AUTOMATIC"},
    }
    r = _req.post(base, headers=headers, json=body, timeout=30)
    if not r.ok:
        if r.status_code == 409:
            r2 = _req.get(f"{base}/{domain}", headers=headers, timeout=10)
            if r2.ok:
                return r2.json()
        r.raise_for_status()
    return r.json()


def _get_domain_mapping_sync(credentials, project_id: str, region: str, domain: str) -> dict:
    """Fetch a Cloud Run v1 domain mapping."""
    import requests as _req
    headers = _get_auth_headers(credentials)
    url = f"https://run.googleapis.com/v1/projects/{project_id}/locations/{region}/domainmappings/{domain}"
    r = _req.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    return r.json()


def _delete_domain_mapping_sync(credentials, project_id: str, region: str, domain: str) -> None:
    """Delete a Cloud Run v1 domain mapping (best-effort)."""
    import requests as _req
    headers = _get_auth_headers(credentials)
    url = f"https://run.googleapis.com/v1/projects/{project_id}/locations/{region}/domainmappings/{domain}"
    _req.delete(url, headers=headers, timeout=30)


async def _portal_setup_custom_domain(
    credentials,
    project_id: str,
    region: str,
    service_name: str,
    dns_domain: str,
    activity,
    loop,
) -> str | None:
    """Create domain mapping + DNS CNAME for login.<dns_domain>.

    Returns the custom portal URL on success, None on failure (caller should use run.app URL).
    """
    import time as _time
    portal_domain = f"login.{dns_domain}"

    await activity(f"Creating domain mapping for {portal_domain}…")
    try:
        mapping = await loop.run_in_executor(
            None, _create_domain_mapping_sync, credentials, project_id, region, service_name, portal_domain
        )
    except Exception as exc:
        await activity(f"WARNING: Domain mapping failed ({exc}). Using run.app URL.")
        return None

    # Extract CNAME target from resourceRecords
    resource_records = mapping.get("status", {}).get("resourceRecords", [])
    cname_target = next(
        (rec["rrdata"] for rec in resource_records if rec.get("type") == "CNAME"),
        "ghs.googlehosted.com.",
    )

    # Create CNAME record in Cloud DNS
    pc = cfg.get_project_config(cfg.settings, project_id)
    zone_name = pc.get("dns_zone_name", "")
    if zone_name:
        try:
            from services.gcp_dns import GCPDnsService
            dns_svc = GCPDnsService(credentials, project_id)
            await dns_svc.upsert_cname_record(
                zone_name=zone_name,
                fqdn=f"{portal_domain}.",
                cname_target=cname_target,
            )
            await activity(f"DNS CNAME created: {portal_domain} → {cname_target.rstrip('.')}")
        except Exception as exc:
            await activity(f"WARNING: DNS CNAME creation failed ({exc}).")
    else:
        await activity(f"DNS zone not configured — add CNAME manually: {portal_domain} → {cname_target.rstrip('.')}")

    # Set the URL immediately; SSL will provision in the background
    custom_url = f"https://{portal_domain}"
    await activity("Domain mapping created. SSL certificate will provision within a few minutes.")
    return custom_url


async def _portal_teardown_custom_domain(
    credentials,
    project_id: str,
    region: str,
    dns_domain: str,
    activity,
    loop,
) -> None:
    """Delete domain mapping and CNAME record for login.<dns_domain>."""
    portal_domain = f"login.{dns_domain}"
    pc = cfg.get_project_config(cfg.settings, project_id)
    zone_name = pc.get("dns_zone_name", "")

    if zone_name:
        try:
            from services.gcp_dns import GCPDnsService
            dns_svc = GCPDnsService(credentials, project_id)
            await dns_svc.delete_cname_record(zone_name=zone_name, fqdn=f"{portal_domain}.")
            await activity(f"DNS CNAME deleted: {portal_domain}")
        except Exception as exc:
            await activity(f"WARNING: Failed to delete DNS CNAME ({exc}).")

    try:
        await loop.run_in_executor(
            None, _delete_domain_mapping_sync, credentials, project_id, region, portal_domain
        )
        await activity(f"Domain mapping deleted: {portal_domain}")
    except Exception as exc:
        await activity(f"WARNING: Failed to delete domain mapping ({exc}).")


# ---------------------------------------------------------------------------
# Portal helpers
# ---------------------------------------------------------------------------


def _portal_service_name(workshop_name: str) -> str:
    """Derive Cloud Run service name from workshop name (max 49 chars, lowercase, alphanumeric + hyphens)."""
    safe = workshop_name.lower().replace('_', '-')[:35]
    return f"fsgcpm-portal-{safe}"


async def _get_cloud_run_region() -> str:
    """Get the configured Cloud Run region from settings."""
    sched = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    region = sched.get("cloud_run_region") or ""
    if not region:
        raise RuntimeError("No Cloud Run region configured. Deploy the scheduling backend first.")
    return region


def _deploy_portal_service(credentials, project_id: str, region: str, service_name: str, workshop_id: str) -> str:
    """Deploy Cloud Run portal service. Returns the service URL."""
    from google.cloud import run_v2

    image = f"gcr.io/{project_id}/fsgcpm-portal:latest"

    import os as _os
    firestore_db_id = _os.environ.get("FIRESTORE_DATABASE_ID", "fabricstudio-gcp-manager")

    client = run_v2.ServicesClient(credentials=credentials)
    parent = f"projects/{project_id}/locations/{region}"
    full_service_name = f"{parent}/services/{service_name}"

    env_vars = [
        run_v2.EnvVar(name="WORKSHOP_ID", value=workshop_id),
        run_v2.EnvVar(name="FIRESTORE_PROJECT_ID", value=project_id),
        run_v2.EnvVar(name="FIRESTORE_DATABASE_ID", value=firestore_db_id),
    ]

    template = run_v2.RevisionTemplate(
        containers=[
            run_v2.Container(
                image=image,
                env=env_vars,
            )
        ],
        scaling=run_v2.ServiceScaling(min_instance_count=0, max_instance_count=5),
    )

    import google.protobuf.field_mask_pb2 as _mask

    try:
        existing = client.get_service(name=full_service_name)
        existing.template = template
        op = client.update_service(
            service=existing,
            update_mask=_mask.FieldMask(paths=["template"]),
        )
        return op.result(timeout=300).uri
    except Exception:
        pass

    service = run_v2.Service(
        template=template,
        ingress=run_v2.IngressTraffic.INGRESS_TRAFFIC_ALL,
    )
    op = client.create_service(parent=parent, service=service, service_id=service_name)
    svc = op.result(timeout=300)

    _set_portal_public(credentials, project_id, region, service_name)

    return svc.uri


def _set_portal_public(credentials, project_id: str, region: str, service_name: str) -> None:
    """Grant allUsers invoker role on the portal Cloud Run service."""
    import requests as _req
    from google.auth.transport.requests import Request as _AuthRequest

    if not getattr(credentials, "valid", True):
        try:
            credentials.refresh(_AuthRequest())
        except Exception:
            pass
    token = getattr(credentials, "token", None)
    if not token:
        credentials.refresh(_AuthRequest())
        token = credentials.token

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    url = f"https://run.googleapis.com/v2/projects/{project_id}/locations/{region}/services/{service_name}:setIamPolicy"
    body = {
        "policy": {
            "bindings": [{"role": "roles/run.invoker", "members": ["allUsers"]}]
        }
    }
    _req.post(url, headers=headers, json=body, timeout=30)


def _delete_portal_service(credentials, project_id: str, region: str, service_name: str) -> None:
    """Delete Cloud Run portal service."""
    from google.cloud import run_v2
    client = run_v2.ServicesClient(credentials=credentials)
    full_name = f"projects/{project_id}/locations/{region}/services/{service_name}"
    try:
        op = client.delete_service(name=full_name)
        op.result(timeout=120)
    except Exception:
        pass  # Already gone


def _upload_source_and_build(headers: dict, project_id: str, portal_dir, target: str) -> None:
    """Upload portal source to GCS staging bucket and trigger Cloud Build."""
    import requests as _req
    import time as _time
    import tarfile as _tar
    import io as _io

    # Create tarball
    buf = _io.BytesIO()
    with _tar.open(fileobj=buf, mode="w:gz") as tf:
        tf.add(portal_dir, arcname=".")
    buf.seek(0)
    tar_bytes = buf.read()

    # Upload to GCS staging bucket
    bucket = f"{project_id}_cloudbuild"
    object_name = f"portal-source-{int(_time.time())}.tar.gz"

    upload_url = f"https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o?uploadType=media&name={object_name}"
    upload_headers = {**headers, "Content-Type": "application/gzip"}
    r = _req.post(upload_url, headers=upload_headers, data=tar_bytes, timeout=60)
    if not r.ok:
        # Try to create bucket first
        _req.post(
            f"https://storage.googleapis.com/storage/v1/b?project={project_id}",
            headers=headers,
            json={"name": bucket},
            timeout=30,
        )
        r = _req.post(upload_url, headers=upload_headers, data=tar_bytes, timeout=60)
        r.raise_for_status()

    # Trigger Cloud Build
    build_body = {
        "steps": [
            {"name": "gcr.io/cloud-builders/docker", "args": ["build", "-t", target, "."]},
            {"name": "gcr.io/cloud-builders/docker", "args": ["push", target]},
        ],
        "images": [target],
        "source": {
            "storageSource": {
                "bucket": bucket,
                "object": object_name,
            }
        },
        "timeout": "600s",
    }

    resp = _req.post(
        f"https://cloudbuild.googleapis.com/v1/projects/{project_id}/builds",
        headers=headers,
        json=build_body,
        timeout=30,
    )
    resp.raise_for_status()
    op_name = resp.json()["name"]

    # Poll until done
    for _ in range(120):
        _time.sleep(5)
        r = _req.get(f"https://cloudbuild.googleapis.com/v1/{op_name}", headers=headers, timeout=10)
        if r.ok:
            data = r.json()
            if data.get("done"):
                if data.get("error"):
                    raise RuntimeError(f"Cloud Build failed: {data['error'].get('message')}")
                status = data.get("metadata", {}).get("build", {}).get("status", "")
                if status == "SUCCESS":
                    return
                if status in ("FAILURE", "CANCELLED", "TIMEOUT"):
                    raise RuntimeError(f"Cloud Build failed: {status}")
    raise RuntimeError("Cloud Build timed out")


def _build_portal_image(credentials, project_id: str) -> None:
    """Build the portal Docker image via Cloud Build from the portal/ source directory."""
    import requests as _req
    from pathlib import Path as _Path
    from google.auth.transport.requests import Request as _AuthRequest

    if not getattr(credentials, "valid", True):
        try:
            credentials.refresh(_AuthRequest())
        except Exception:
            pass
    token = getattr(credentials, "token", None)
    if not token:
        credentials.refresh(_AuthRequest())
        token = credentials.token

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    target = f"gcr.io/{project_id}/fsgcpm-portal:latest"
    portal_dir = _Path(__file__).parent.parent.parent / "portal"
    _upload_source_and_build(headers, project_id, portal_dir, target)


async def _portal_deploy_job(job_id: str, workshop_id: str) -> None:
    """Deploy portal Cloud Run service for a workshop."""
    q = job_manager.jobs[job_id]

    async def activity(msg: str) -> None:
        await q.put(msg)
        await fs.update_workshop(workshop_id, {"current_activity": msg})

    try:
        workshop = await fs.get_workshop(workshop_id)
        if not workshop:
            await job_manager.mark_done(job_id, failed=True)
            return

        project_id = cfg.settings.active_project_id
        credentials = get_credentials()
        loop = asyncio.get_event_loop()

        try:
            region = await _get_cloud_run_region()
        except RuntimeError as exc:
            await activity(f"ERROR: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        service_name = _portal_service_name(workshop["name"])

        # Build portal image
        await activity("Building portal Docker image…")
        try:
            await loop.run_in_executor(None, _build_portal_image, credentials, project_id)
            await activity("Portal image built.")
        except Exception as exc:
            await activity(f"ERROR building portal image: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        # Deploy Cloud Run service
        await activity("Deploying portal Cloud Run service…")
        try:
            run_app_url = await loop.run_in_executor(
                None, _deploy_portal_service, credentials, project_id, region, service_name, workshop_id
            )
        except Exception as exc:
            await activity(f"ERROR deploying portal: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        portal_url = run_app_url

        # Attempt custom domain mapping for login.<dns_domain>
        workshop_fresh = await fs.get_workshop(workshop_id)
        dns_domain = workshop_fresh.get("dns_domain", "") if workshop_fresh else ""
        if dns_domain:
            custom_url = await _portal_setup_custom_domain(
                credentials, project_id, region, service_name, dns_domain, activity, loop
            )
            if custom_url:
                portal_url = custom_url

        await fs.update_workshop(workshop_id, {
            "portal_enabled": True,
            "portal_url": portal_url,
            "current_activity": "Portal is live.",
        })
        await q.put(f"Portal live at {portal_url}")
        await job_manager.mark_done(job_id)

    except Exception as exc:
        await q.put(f"ERROR: {exc}")
        await fs.update_workshop(workshop_id, {"portal_enabled": False, "current_activity": f"Portal deploy failed: {exc}"})
        await job_manager.mark_done(job_id, failed=True)


async def _portal_teardown_job(job_id: str, workshop_id: str) -> None:
    """Tear down portal Cloud Run service for a workshop."""
    q = job_manager.jobs[job_id]

    async def activity(msg: str) -> None:
        await q.put(msg)
        await fs.update_workshop(workshop_id, {"current_activity": msg})

    try:
        workshop = await fs.get_workshop(workshop_id)
        if not workshop:
            await job_manager.mark_done(job_id, failed=True)
            return

        project_id = cfg.settings.active_project_id
        credentials = get_credentials()
        loop = asyncio.get_event_loop()

        try:
            region = await _get_cloud_run_region()
        except RuntimeError as exc:
            await activity(f"ERROR: {exc}")
            await job_manager.mark_done(job_id, failed=True)
            return

        service_name = _portal_service_name(workshop["name"])
        dns_domain = workshop.get("dns_domain", "")

        # Tear down domain mapping + DNS CNAME first
        if dns_domain:
            await _portal_teardown_custom_domain(
                credentials, project_id, region, dns_domain, activity, loop
            )

        await activity("Tearing down portal Cloud Run service…")
        await loop.run_in_executor(None, _delete_portal_service, credentials, project_id, region, service_name)

        await fs.update_workshop(workshop_id, {
            "portal_enabled": False,
            "portal_url": None,
            "current_activity": "Portal offline.",
        })
        await q.put("Portal offline.")
        await job_manager.mark_done(job_id)

    except Exception as exc:
        await q.put(f"ERROR: {exc}")
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


@router.post("/{workshop_id}/toggle-portal")
async def toggle_portal(workshop_id: str, background_tasks: BackgroundTasks):
    """Deploy or tear down the registration portal for a workshop."""
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")

    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)

    if workshop.get("portal_enabled"):
        background_tasks.add_task(_portal_teardown_job, job_id, workshop_id)
        return {"job_id": job_id, "action": "teardown"}
    else:
        if workshop["status"] not in ("running",):
            raise HTTPException(status_code=400, detail="Portal can only be enabled when the workshop is running.")
        background_tasks.add_task(_portal_deploy_job, job_id, workshop_id)
        return {"job_id": job_id, "action": "deploy"}
