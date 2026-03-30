"""
Cloud Run deploy/manage router.

Endpoints:
  GET  /api/cloud-run/permissions          — check IAM permissions required for deploy
  GET  /api/cloud-run/subnets?region=X     — list subnets in region
  POST /api/cloud-run/deploy               — start deploy job, returns deploy_id
  GET  /api/cloud-run/deploy/{id}/stream   — SSE log stream for deploy job
"""

import asyncio
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from services.parallel_runner import JobManager

router = APIRouter(prefix="/api/cloud-run", tags=["cloud-run"])

_deploy_manager = JobManager()
_undeploy_manager = JobManager()

# Permissions grouped for display
_PERMISSION_GROUPS = [
    ("Cloud Run",   ["run.services.create", "run.services.update"]),
    ("IAM",         ["iam.serviceAccounts.actAs"]),
    ("APIs",        ["serviceusage.services.enable"]),
    ("Firestore",   ["datastore.databases.create"]),
    ("Cloud Build", ["cloudbuild.builds.create"]),
    ("Firewall",    ["compute.firewalls.create"]),
]
_ALL_PERMISSIONS = [p for _, perms in _PERMISSION_GROUPS for p in perms]

SERVICE_NAME = "fabricstudio-scheduler"
GHCR_IMAGE = "ghcr.io/4tnetse/fabricstudio-gcp-manager:latest"


def _gcr_image(project_id: str, version: str) -> str:
    return f"gcr.io/{project_id}/fabricstudio-gcp-manager:v{version}"


# ---------------------------------------------------------------------------
# Permissions check
# ---------------------------------------------------------------------------

@router.get("/permissions")
async def check_permissions():
    """Test IAM permissions needed to deploy the Cloud Run scheduler."""
    credentials = get_credentials()
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")

    loop = asyncio.get_event_loop()

    def _run():
        from google.cloud import resourcemanager_v3
        client = resourcemanager_v3.ProjectsClient(credentials=credentials)
        return set(client.test_iam_permissions(
            request={"resource": f"projects/{project_id}", "permissions": _ALL_PERMISSIONS}
        ).permissions)

    try:
        granted = await loop.run_in_executor(None, _run)
    except Exception as exc:
        exc_str = str(exc)
        if "SERVICE_DISABLED" in exc_str and "cloudresourcemanager.googleapis.com" in exc_str:
            import re
            match = re.search(r"https://console\.developers\.google\.com/\S+", exc_str)
            url = match.group(0).rstrip("]") if match else f"https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com?project={project_id}"
            raise HTTPException(status_code=503, detail=f"Cloud Resource Manager API is disabled. Enable it at: {url}")
        raise HTTPException(status_code=500, detail=exc_str)

    return {
        "groups": [
            {
                "name": name,
                "passed": all(p in granted for p in perms),
                "permissions": [{"name": p, "granted": p in granted} for p in perms],
            }
            for name, perms in _PERMISSION_GROUPS
        ]
    }


# ---------------------------------------------------------------------------
# Subnet listing
# ---------------------------------------------------------------------------

@router.get("/subnets")
async def list_subnets(region: str):
    """List subnets in the given region for the active project."""
    credentials = get_credentials()
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")

    loop = asyncio.get_event_loop()

    def _run():
        from google.cloud import compute_v1
        client = compute_v1.SubnetworksClient(credentials=credentials)
        result = []
        for subnet in client.list(project=project_id, region=region):
            network_name = subnet.network.split("/")[-1] if subnet.network else ""
            result.append({
                "name": subnet.name,
                "network": network_name,
                "cidr": subnet.ip_cidr_range,
            })
        return result

    try:
        return await loop.run_in_executor(None, _run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

class DeployRequest(BaseModel):
    region: str
    subnet: str


@router.post("/deploy")
async def start_deploy(req: DeployRequest):
    """Start a Cloud Run deploy. Returns deploy_id for SSE streaming."""
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")

    deploy_id = str(uuid.uuid4())
    q = _deploy_manager.create_job(deploy_id)
    asyncio.create_task(_run_deploy(deploy_id, q, project_id, req.region, req.subnet))
    return {"deploy_id": deploy_id}


@router.get("/deploy/{deploy_id}/stream")
async def stream_deploy(deploy_id: str):
    """SSE log stream for a running deploy job."""
    async def generator():
        async for chunk in _deploy_manager.stream_job(deploy_id):
            yield chunk

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Undeploy
# ---------------------------------------------------------------------------

@router.post("/undeploy")
async def start_undeploy():
    """Start Cloud Run undeploy. Returns undeploy_id for SSE streaming."""
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    sched = cfg.get_project_scheduling(cfg.settings, project_id)
    region = sched.get("cloud_run_region") or ""
    if not region:
        raise HTTPException(status_code=400, detail="No Cloud Run region configured.")
    undeploy_id = str(uuid.uuid4())
    q = _undeploy_manager.create_job(undeploy_id)
    asyncio.create_task(_run_undeploy(undeploy_id, q, project_id, region))
    return {"undeploy_id": undeploy_id}


@router.get("/undeploy/{undeploy_id}/stream")
async def stream_undeploy(undeploy_id: str):
    """SSE log stream for a running undeploy job."""
    async def generator():
        async for chunk in _undeploy_manager.stream_job(undeploy_id):
            yield chunk
    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Deploy implementation (runs in background task)
# ---------------------------------------------------------------------------

async def _run_deploy(deploy_id: str, q: asyncio.Queue, project_id: str, region: str, subnet: str):
    loop = asyncio.get_event_loop()

    async def log(msg: str):
        await q.put(msg)

    try:
        credentials = get_credentials()

        from pathlib import Path as _Path
        _ver_file = _Path(__file__).parent.parent.parent / "VERSION"
        local_version = _ver_file.read_text().splitlines()[0].strip() if _ver_file.exists() else "latest"

        # Step 1 — Enable APIs
        await log("Enabling Cloud Run, Firestore and Cloud Scheduler APIs...")
        try:
            await loop.run_in_executor(None, _enable_apis, credentials, project_id)
            await log("✓ APIs enabled")
        except Exception as exc:
            await log(f"⚠  Could not enable APIs ({exc}) — they may already be enabled, continuing.")

        # Step 2 — Get project number for the default compute SA
        await log("Fetching project info...")
        project_number = await loop.run_in_executor(None, _get_project_number, credentials, project_id)
        service_account = f"{project_number}-compute@developer.gserviceaccount.com"
        await log(f"✓ Runtime service account: {service_account}")

        # Step 3 — Ensure Firestore database exists
        await log("Setting up Firestore database (native mode)...")
        try:
            await loop.run_in_executor(None, _ensure_firestore, credentials, project_id, region)
            await log("✓ Firestore ready")
        except Exception as exc:
            await log(f"⚠  Firestore: {exc}")

        # Step 4 — Ensure firewall rule allows Cloud Run to reach instances
        await log("Ensuring firewall rule 'fs-gcpbackend-to-instances'...")
        try:
            await loop.run_in_executor(None, _ensure_firewall_rule, credentials, project_id)
            await log("✓ Firewall rule ready")
        except Exception as exc:
            await log(f"⚠  Firewall rule: {exc}")

        # Step 5 — Copy image from ghcr.io to gcr.io via Cloud Build
        await log(f"Copying container image to gcr.io/{project_id} (v{local_version}) via Cloud Build (this may take a few minutes)...")
        image = await loop.run_in_executor(None, _copy_image_to_gcr, credentials, project_id, local_version)
        await log(f"✓ Image ready: {image}")

        # Step 6 — Deploy or update Cloud Run service
        await log(f"Deploying Cloud Run service '{SERVICE_NAME}' to {region}...")
        url = await loop.run_in_executor(
            None, _deploy_cloud_run_service, credentials, project_id, region, subnet, service_account, image
        )
        await log(f"✓ Deployed: {url}")

        # Step 6b — Inject BACKEND_URL + CLOUD_RUN_REGION so Cloud Run can create Cloud Scheduler jobs
        await log("Configuring Cloud Run environment variables...")
        await loop.run_in_executor(
            None, _set_cloud_run_env, credentials, project_id, region, url
        )
        await log("✓ Environment variables set")

        # Step 7 — Persist settings
        await loop.run_in_executor(None, _update_settings, url, region, project_id)
        await log("✓ Settings saved")

        # Signal URL to frontend (filtered out of log, used to auto-fill the URL field)
        await q.put(f"__URL:{url}")
        await _deploy_manager.mark_done(deploy_id)

    except Exception as exc:
        exc_str = str(exc)
        if "SERVICE_DISABLED" in exc_str:
            import re as _re
            m = _re.search(r"https://console\.developers\.google\.com/\S+", exc_str)
            url = m.group(0).rstrip("]") if m else ""
            msg = f"✗ A required API is disabled.{(' Enable it at: ' + url) if url else ''}"
        else:
            msg = f"✗ Deploy failed: {exc_str[:300]}"
        await log(msg)
        await _deploy_manager.mark_done(deploy_id, failed=True)


# ---------------------------------------------------------------------------
# Sync helper functions (run in executor)
# ---------------------------------------------------------------------------

def _enable_apis(credentials, project_id: str) -> None:
    import requests as _req
    from google.auth.transport.requests import Request as _AuthRequest

    if not getattr(credentials, "valid", True):
        try:
            credentials.refresh(_AuthRequest())
        except Exception:
            pass
    token = getattr(credentials, "token", None)
    if not token:
        try:
            credentials.refresh(_AuthRequest())
            token = credentials.token
        except Exception:
            pass
    if not token:
        raise RuntimeError("Could not obtain access token to enable APIs")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    base = f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services"
    apis = ["run.googleapis.com", "firestore.googleapis.com", "cloudscheduler.googleapis.com", "cloudbuild.googleapis.com"]
    for api in apis:
        try:
            r = _req.get(f"{base}/{api}", headers=headers, timeout=10)
            if r.ok and r.json().get("state") == "ENABLED":
                continue
        except Exception:
            pass
        try:
            _req.post(f"{base}/{api}:enable", headers=headers, timeout=120)
        except Exception:
            pass


FIREWALL_RULE_NAME = "fs-gcpbackend-to-instances"


CLOUD_RUN_NETWORK_TAG = "fs-gcp-manager-gcpbackend"


def _ensure_firewall_rule(credentials, project_id: str) -> None:
    """Create firewall rule allowing Cloud Run (tagged fs-gcp-manager-gcpbackend) to reach all instances (TCP 80/443)."""
    from google.cloud import compute_v1

    client = compute_v1.FirewallsClient(credentials=credentials)

    try:
        client.get(project=project_id, firewall=FIREWALL_RULE_NAME)
        return  # Already exists
    except Exception:
        pass

    firewall = compute_v1.Firewall(
        name=FIREWALL_RULE_NAME,
        network=f"projects/{project_id}/global/networks/default",
        priority=950,
        direction="INGRESS",
        source_tags=[CLOUD_RUN_NETWORK_TAG],
        allowed=[
            compute_v1.Allowed(
                I_p_protocol="tcp",
                ports=["80", "443"],
            )
        ],
        description="Allow Cloud Run backend (fs-gcp-manager-gcpbackend) to reach Fabric Studio instances (TCP 80/443)",
    )
    op = client.insert(project=project_id, firewall_resource=firewall)
    op.result()


def _copy_image_to_gcr(credentials, project_id: str, version: str) -> str:
    """Copy GHCR_IMAGE to gcr.io/{project_id} tagged with version via Cloud Build. Returns the GCR image URI."""
    import requests as _req
    import time

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

    target = _gcr_image(project_id, version)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    build_body = {
        "steps": [
            {"name": "gcr.io/cloud-builders/docker", "args": ["pull", GHCR_IMAGE]},
            {"name": "gcr.io/cloud-builders/docker", "args": ["tag", GHCR_IMAGE, target]},
            {"name": "gcr.io/cloud-builders/docker", "args": ["push", target]},
        ],
        "images": [target],
        "timeout": "600s",
    }

    resp = _req.post(
        f"https://cloudbuild.googleapis.com/v1/projects/{project_id}/builds",
        headers=headers,
        json=build_body,
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(
            f"Cloud Build API returned HTTP {resp.status_code}: {resp.text[:500]}"
        )
    resp.raise_for_status()
    op_name = resp.json()["name"]

    for _ in range(120):  # poll up to 10 min
        time.sleep(5)
        r = _req.get(
            f"https://cloudbuild.googleapis.com/v1/{op_name}",
            headers=headers,
            timeout=10,
        )
        if r.ok:
            data = r.json()
            if data.get("done"):
                if data.get("error"):
                    raise RuntimeError(f"Cloud Build failed: {data['error'].get('message', 'unknown')}")
                status = data.get("metadata", {}).get("build", {}).get("status", "")
                if status == "SUCCESS":
                    return target
                if status in ("FAILURE", "CANCELLED", "TIMEOUT", "INTERNAL_ERROR"):
                    raise RuntimeError(f"Cloud Build failed with status: {status}")
    raise RuntimeError("Cloud Build timed out after 10 minutes")


def _get_project_number(credentials, project_id: str) -> str:
    from google.cloud import resourcemanager_v3

    client = resourcemanager_v3.ProjectsClient(credentials=credentials)
    project = client.get_project(name=f"projects/{project_id}")
    return project.name.split("/")[1]  # "projects/123456" -> "123456"


def _ensure_firestore(credentials, project_id: str, region: str) -> None:
    from google.cloud import firestore_admin_v1
    from services.firestore_client import FIRESTORE_DATABASE_ID

    client = firestore_admin_v1.FirestoreAdminClient(credentials=credentials)
    db_name = f"projects/{project_id}/databases/{FIRESTORE_DATABASE_ID}"

    try:
        client.get_database(name=db_name)
        return  # Already exists
    except Exception:
        pass

    from google.cloud.firestore_admin_v1.types import Database as _FSDatabase

    op = client.create_database(
        parent=f"projects/{project_id}",
        database=_FSDatabase(
            location_id=region,
            type_=_FSDatabase.DatabaseType.FIRESTORE_NATIVE,
        ),
        database_id=FIRESTORE_DATABASE_ID,
    )
    op.result(timeout=120)


def _deploy_cloud_run_service(
    credentials, project_id: str, region: str, subnet: str, service_account: str, image: str
) -> str:
    from google.cloud import run_v2
    from google.protobuf import field_mask_pb2

    client = run_v2.ServicesClient(credentials=credentials)
    parent = f"projects/{project_id}/locations/{region}"
    service_name = f"{parent}/services/{SERVICE_NAME}"

    template = run_v2.RevisionTemplate(
        containers=[
            run_v2.Container(
                image=image,
                env=[run_v2.EnvVar(name="APP_MODE", value="backend")],
            )
        ],
        service_account=service_account,
        vpc_access=run_v2.VpcAccess(
            network_interfaces=[
                run_v2.VpcAccess.NetworkInterface(
                    subnetwork=subnet,
                    tags=[CLOUD_RUN_NETWORK_TAG],
                )
            ],
            egress=run_v2.VpcAccess.VpcEgress.PRIVATE_RANGES_ONLY,
        ),
    )

    # Try update first; fall back to create
    try:
        existing = client.get_service(name=service_name)
        existing.template = template
        op = client.update_service(
            service=existing,
            update_mask=field_mask_pb2.FieldMask(paths=["template"]),
        )
        return op.result(timeout=300).uri
    except Exception:
        pass

    service = run_v2.Service(
        template=template,
        ingress=run_v2.IngressTraffic.INGRESS_TRAFFIC_ALL,
    )
    op = client.create_service(parent=parent, service=service, service_id=SERVICE_NAME)
    return op.result(timeout=300).uri


def _set_cloud_run_env(credentials, project_id: str, region: str, backend_url: str) -> None:
    """Update the Cloud Run service to set BACKEND_URL and CLOUD_RUN_REGION env vars.

    These are required by Cloud Run to create Cloud Scheduler jobs pointing back at itself.
    Called as a second pass after the initial deploy so the URL is known.
    """
    from google.cloud import run_v2
    from google.protobuf import field_mask_pb2

    client = run_v2.ServicesClient(credentials=credentials)
    service_name = f"projects/{project_id}/locations/{region}/services/{SERVICE_NAME}"
    service = client.get_service(name=service_name)

    # Merge new env vars into the existing container env list, replacing any existing entries
    existing_env = {e.name: e.value for e in service.template.containers[0].env}
    existing_env["APP_MODE"] = "backend"
    existing_env["BACKEND_URL"] = backend_url
    existing_env["CLOUD_RUN_REGION"] = region
    existing_env["FIRESTORE_DATABASE_ID"] = "fabricstudio-gcp-manager"

    service.template.containers[0].env = [
        run_v2.EnvVar(name=k, value=v) for k, v in existing_env.items()
    ]
    update_mask = field_mask_pb2.FieldMask(paths=["template"])
    client.update_service(service=service, update_mask=update_mask).result(timeout=300)


def _update_settings(url: str, region: str, project_id: str) -> None:
    sched = cfg.get_project_scheduling(cfg.settings, project_id)
    patch = {
        "remote_backend_url": url,
        "cloud_run_region": region,
        "firestore_project_id": sched.get("firestore_project_id") or project_id,
        "remote_scheduling_enabled": True,
    }
    updated = cfg.set_project_scheduling(cfg.settings, project_id, patch)
    cfg.settings = updated
    cfg.save_settings(updated)


# ---------------------------------------------------------------------------
# Undeploy implementation (runs in background task)
# ---------------------------------------------------------------------------

async def _run_undeploy(undeploy_id: str, q: asyncio.Queue, project_id: str, region: str):
    loop = asyncio.get_event_loop()

    async def log(msg: str):
        await q.put(msg)

    try:
        credentials = get_credentials()

        # Step 1 — Delete Cloud Scheduler jobs
        await log("Deleting Cloud Scheduler jobs...")
        try:
            count = await loop.run_in_executor(None, _delete_scheduler_jobs, credentials, project_id, region)
            await log(f"✓ Deleted {count} Cloud Scheduler job(s)")
        except Exception as exc:
            await log(f"⚠  Cloud Scheduler: {exc}")

        # Step 2 — Delete Cloud Run service
        await log(f"Deleting Cloud Run service '{SERVICE_NAME}'...")
        try:
            await loop.run_in_executor(None, _delete_cloud_run_service, credentials, project_id, region)
            await log("✓ Cloud Run service deleted")
        except Exception as exc:
            await log(f"⚠  Cloud Run: {exc}")

        # Step 3 — Delete firewall rule
        await log(f"Deleting firewall rule '{FIREWALL_RULE_NAME}'...")
        try:
            await loop.run_in_executor(None, _delete_firewall_rule_resource, credentials, project_id)
            await log("✓ Firewall rule deleted")
        except Exception as exc:
            await log(f"⚠  Firewall rule: {exc}")

        # Step 4 — Delete GCR images
        await log(f"Deleting container images from gcr.io/{project_id}...")
        try:
            count = await loop.run_in_executor(None, _delete_gcr_images, credentials, project_id)
            await log(f"✓ Deleted {count} image(s) from container registry")
        except Exception as exc:
            await log(f"⚠  Container registry cleanup: {exc}")

        # Step 5 — Delete Firestore data
        await log("Deleting Firestore schedules and job runs...")
        try:
            counts = await loop.run_in_executor(None, _delete_firestore_data, project_id)
            await log(f"✓ Deleted {counts[0]} schedule(s) and {counts[1]} job run(s) from Firestore")
        except Exception as exc:
            await log(f"⚠  Firestore cleanup: {exc}")

        # Step 6 — Clear scheduling settings
        await loop.run_in_executor(None, _clear_scheduling_settings, project_id)
        await log("✓ Scheduling settings cleared")

        await _undeploy_manager.mark_done(undeploy_id)

    except Exception as exc:
        await log(f"✗ Undeploy failed: {str(exc)[:300]}")
        await _undeploy_manager.mark_done(undeploy_id, failed=True)


def _delete_scheduler_jobs(credentials, project_id: str, region: str) -> int:
    from google.cloud import scheduler_v1
    client = scheduler_v1.CloudSchedulerClient(credentials=credentials)
    parent = f"projects/{project_id}/locations/{region}"
    count = 0
    try:
        for job in client.list_jobs(parent=parent):
            if "fabricstudio" in job.name.lower():
                try:
                    client.delete_job(name=job.name)
                    count += 1
                except Exception:
                    pass
    except Exception:
        pass
    return count


def _delete_cloud_run_service(credentials, project_id: str, region: str) -> None:
    from google.cloud import run_v2
    client = run_v2.ServicesClient(credentials=credentials)
    service_name = f"projects/{project_id}/locations/{region}/services/{SERVICE_NAME}"
    op = client.delete_service(name=service_name)
    op.result(timeout=120)


def _delete_firewall_rule_resource(credentials, project_id: str) -> None:
    from google.cloud import compute_v1
    client = compute_v1.FirewallsClient(credentials=credentials)
    try:
        client.get(project=project_id, firewall=FIREWALL_RULE_NAME)
    except Exception:
        return  # Already gone
    op = client.delete(project=project_id, firewall=FIREWALL_RULE_NAME)
    op.result()


def _delete_gcr_images(credentials, project_id: str) -> int:
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

    headers = {"Authorization": f"Bearer {token}"}
    base = f"https://gcr.io/v2/{project_id}/fabricstudio-gcp-manager"

    r = _req.get(f"{base}/tags/list", headers=headers, timeout=10)
    if not r.ok:
        return 0

    tags = r.json().get("tags") or []
    deleted_digests: set = set()
    count = 0
    for tag in tags:
        r2 = _req.head(
            f"{base}/manifests/{tag}",
            headers={**headers, "Accept": "application/vnd.docker.distribution.manifest.v2+json"},
            timeout=10,
        )
        digest = r2.headers.get("Docker-Content-Digest")
        if digest and digest not in deleted_digests:
            d = _req.delete(f"{base}/manifests/{digest}", headers=headers, timeout=10)
            if d.ok:
                deleted_digests.add(digest)
                count += 1
    return count


def _delete_firestore_data(project_id: str) -> tuple[int, int]:
    """Delete all schedules and job_runs in Firestore for the given project.

    Returns (schedule_count, run_count).
    """
    from google.cloud import firestore
    from services.key_store import get_key_path
    from google.oauth2 import service_account
    from services.firestore_client import FIRESTORE_DATABASE_ID

    key_id = cfg.settings.active_key_id or ""
    key_path = get_key_path(key_id)
    creds = service_account.Credentials.from_service_account_file(str(key_path))
    db = firestore.Client(project=project_id, database=FIRESTORE_DATABASE_ID, credentials=creds)

    # Collect schedule IDs for this project, then delete them + their runs
    schedule_refs = [
        doc.reference
        for doc in db.collection("schedules").where("project_id", "==", project_id).stream()
    ]
    schedule_ids = {ref.id for ref in schedule_refs}

    # Delete matching job_runs
    run_count = 0
    for doc in db.collection("job_runs").stream():
        if doc.to_dict().get("project_id") == project_id or doc.to_dict().get("schedule_id") in schedule_ids:
            doc.reference.delete()
            run_count += 1

    # Delete schedules
    for ref in schedule_refs:
        ref.delete()

    return len(schedule_refs), run_count


def _clear_scheduling_settings(project_id: str) -> None:
    patch = {
        "remote_scheduling_enabled": False,
        "remote_backend_url": "",
        "cloud_run_region": "",
        "firestore_project_id": "",
    }
    updated = cfg.set_project_config(cfg.settings, project_id, patch)
    cfg.settings = updated
    cfg.save_settings(updated)
