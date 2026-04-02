import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

import config as cfg
from models.settings import SettingsUpdate
from services import key_store

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings():
    s = cfg.settings
    data = s.model_dump()
    # mask full path for security
    if data.get("service_account_key_path"):
        data["service_account_key_path"] = Path(data["service_account_key_path"]).name
    # add has_keys flag for sidebar
    data["has_keys"] = len(key_store.load_keys()) > 0
    # Overlay all per-project settings for the active project
    data.update(cfg.get_project_config(s, s.active_project_id))
    return data


@router.put("")
async def update_settings(update: SettingsUpdate):
    s = cfg.settings
    patch = update.model_dump(exclude_none=True)

    # Per-project fields go to project_configs; global fields (key mgmt) stay global
    per_project_patch = {k: v for k, v in patch.items() if k in cfg._PER_PROJECT_FIELDS}
    global_patch = {k: v for k, v in patch.items() if k not in cfg._PER_PROJECT_FIELDS}

    updated = s.model_copy(update=global_patch)
    if per_project_patch and s.active_project_id:
        updated = cfg.set_project_config(updated, s.active_project_id, per_project_patch)

    cfg.settings = updated
    cfg.save_settings(updated)

    # If scheduling-related fields changed, clear the remote version cache
    if any(k in per_project_patch for k in ("cloud_run_region", "remote_backend_url", "remote_scheduling_enabled")):
        import main as _main
        _main._remote_version_cache["version"] = None
        _main._remote_version_cache["expires"] = 0.0

    return {"detail": "Settings saved"}


# ---- Project Health ----

_HEALTH_PERMISSION_GROUPS = [
    ("Instances", [
        "compute.instances.list",
        "compute.instances.get",
        "compute.instances.start",
        "compute.instances.stop",
        "compute.instances.delete",
        "compute.instances.create",
        "compute.instances.setMetadata",
        "compute.instances.setLabels",
        "compute.instances.setTags",
        "compute.zoneOperations.get",
    ]),
    ("Images & Build", [
        "compute.images.list",
        "compute.images.create",
        "compute.images.delete",
        "compute.machineTypes.list",
        "compute.zones.list",
        "compute.disks.create",
        "compute.diskTypes.list",
    ]),
    ("Network", [
        "compute.networks.list",
        "compute.subnetworks.list",
        "compute.firewalls.list",
        "compute.firewalls.create",
        "compute.firewalls.delete",
        "compute.addresses.list",
    ]),
    ("DNS", [
        "dns.managedZones.list",
        "dns.resourceRecordSets.list",
        "dns.resourceRecordSets.create",
        "dns.resourceRecordSets.delete",
        "dns.changes.create",
    ]),
    ("Scheduling (Cloud Run)", [
        "run.services.create",
        "run.services.update",
        "run.services.get",
        "cloudbuild.builds.create",
        "iam.serviceAccounts.actAs",
        "datastore.databases.create",
        "serviceusage.services.enable",
        "resourcemanager.projects.getIamPolicy",
        "resourcemanager.projects.setIamPolicy",
    ]),
]

_HEALTH_APIS = [
    ("compute.googleapis.com", "Compute Engine"),
    ("dns.googleapis.com", "Cloud DNS"),
    ("run.googleapis.com", "Cloud Run"),
    ("cloudbuild.googleapis.com", "Cloud Build"),
    ("cloudscheduler.googleapis.com", "Cloud Scheduler"),
    ("firestore.googleapis.com", "Firestore"),
    ("cloudresourcemanager.googleapis.com", "Cloud Resource Manager"),
]


@router.get("/health")
async def project_health():
    """Check IAM permissions and API enablement for the active project."""
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")

    from auth import get_credentials
    import asyncio

    credentials = get_credentials()
    project_id = cfg.settings.active_project_id
    loop = asyncio.get_event_loop()

    all_permissions = [p for _, perms in _HEALTH_PERMISSION_GROUPS for p in perms]

    def _run():
        import requests as _req
        from google.auth.transport.requests import Request as _AuthRequest
        from google.cloud import resourcemanager_v3

        # --- Permissions ---
        client = resourcemanager_v3.ProjectsClient(credentials=credentials)
        try:
            granted = set(client.test_iam_permissions(
                request={"resource": f"projects/{project_id}", "permissions": all_permissions}
            ).permissions)
        except Exception as exc:
            if "is not valid for this resource" in str(exc):
                # Some permissions aren't testable at project level — test each group separately
                # and skip permissions that cause errors
                granted = set()
                for _, perms in _HEALTH_PERMISSION_GROUPS:
                    try:
                        result = client.test_iam_permissions(
                            request={"resource": f"projects/{project_id}", "permissions": perms}
                        )
                        granted.update(result.permissions)
                    except Exception:
                        # Try one-by-one for this group
                        for p in perms:
                            try:
                                result = client.test_iam_permissions(
                                    request={"resource": f"projects/{project_id}", "permissions": [p]}
                                )
                                granted.update(result.permissions)
                            except Exception:
                                pass  # Skip permissions not valid at project level
            else:
                raise

        # --- APIs ---
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
        api_results = []
        for api_id, api_name in _HEALTH_APIS:
            try:
                r = _req.get(
                    f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/{api_id}",
                    headers=headers,
                    timeout=10,
                )
                enabled = r.ok and r.json().get("state") == "ENABLED"
            except Exception:
                enabled = False
            api_results.append({"id": api_id, "name": api_name, "enabled": enabled})

        return granted, api_results

    try:
        granted, api_results = await loop.run_in_executor(None, _run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    permission_groups = [
        {
            "name": group_name,
            "passed": all(p in granted for p in perms),
            "items": [{"name": p, "granted": p in granted} for p in perms],
        }
        for group_name, perms in _HEALTH_PERMISSION_GROUPS
    ]

    return {"permission_groups": permission_groups, "apis": api_results}


_ALLOWED_APIS = {api_id for api_id, _ in _HEALTH_APIS}


class EnableApiRequest(BaseModel):
    api_id: str


@router.post("/health/enable-api")
async def enable_api(body: EnableApiRequest):
    """Enable a single GCP API for the active project."""
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    if body.api_id not in _ALLOWED_APIS:
        raise HTTPException(status_code=400, detail=f"API '{body.api_id}' is not in the allowed list.")

    from auth import get_credentials
    import asyncio
    import time

    credentials = get_credentials()
    project_id = cfg.settings.active_project_id
    loop = asyncio.get_event_loop()

    def _run():
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
        base = f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services"

        # Check current state
        r = _req.get(f"{base}/{body.api_id}", headers=headers, timeout=10)
        if r.ok and r.json().get("state") == "ENABLED":
            return  # Already enabled

        # Enable it
        resp = _req.post(f"{base}/{body.api_id}:enable", headers=headers, json={}, timeout=30)
        if not resp.ok:
            raise RuntimeError(f"Failed to enable {body.api_id} (HTTP {resp.status_code}): {resp.text[:200]}")

        # Poll until enabled (up to 60s)
        op = resp.json()
        op_name = op.get("name")
        if op_name:
            for _ in range(12):
                time.sleep(5)
                r2 = _req.get(
                    f"https://serviceusage.googleapis.com/v1/{op_name}",
                    headers=headers,
                    timeout=10,
                )
                if r2.ok and r2.json().get("done"):
                    break

    try:
        await loop.run_in_executor(None, _run)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"detail": f"{body.api_id} enabled"}


# ---- Networks ----

class CreateNetworkRequest(BaseModel):
    name: str


@router.post("/networks")
async def create_network(body: CreateNetworkRequest):
    """Create a new VPC network with auto subnets and global routing."""
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    import re
    if not re.fullmatch(r'[a-z][a-z0-9\-]{0,62}', body.name):
        raise HTTPException(status_code=400, detail="Invalid network name.")
    from auth import get_credentials
    from services.gcp_compute import GCPComputeService
    svc = GCPComputeService(get_credentials(), cfg.settings.active_project_id)
    try:
        await svc.create_network(body.name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"name": body.name}


@router.get("/networks")
async def list_networks():
    """Return the list of VPC network names in the active project."""
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    from auth import get_credentials
    from services.gcp_compute import GCPComputeService
    svc = GCPComputeService(get_credentials(), cfg.settings.active_project_id)
    try:
        names = await svc.list_networks()
        return {"networks": names}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Notifications ----

class TeamsTestRequest(BaseModel):
    webhook_url: str


@router.post("/test-teams")
async def test_teams_webhook(body: TeamsTestRequest):
    """Send a test message to the given Teams webhook URL."""
    from services.teams_notify import notify_teams
    try:
        await notify_teams(
            webhook_url=body.webhook_url,
            schedule_name="Test notification",
            job_type="configure",
            status="completed",
            project_id=cfg.settings.active_project_id or "example-project",
            triggered_by="manual",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


# ---- Key management ----

@router.get("/keys")
async def list_keys():
    return key_store.load_keys()


@router.post("/keys")
async def upload_key(file: UploadFile = File(...)):
    contents = await file.read()
    meta = key_store.add_key(contents, file.filename or "key.json")
    return meta


@router.delete("/keys/{key_id}")
async def delete_key(key_id: str):
    keys = key_store.load_keys()
    key_meta = next((k for k in keys if k.id == key_id), None)
    if not key_meta:
        raise HTTPException(status_code=404, detail="Key not found")
    key_store.delete_key(key_id)

    key_project_ids = {p.id for p in key_meta.projects}
    update: dict = {}

    if cfg.settings.active_key_id == key_id:
        update["active_key_id"] = None
        update["active_project_id"] = None

    # Always clear legacy key path so migrate_from_legacy doesn't re-import this key on restart
    if cfg.settings.service_account_key_path:
        update["service_account_key_path"] = None
        update["service_account_key_name"] = None

    # Remove per-project configs for this key's projects
    update["project_configs"] = {k: v for k, v in cfg.settings.project_configs.items() if k not in key_project_ids}
    update["scheduling_configs"] = {k: v for k, v in cfg.settings.scheduling_configs.items() if k not in key_project_ids}

    updated = cfg.settings.model_copy(update=update)
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Key deleted"}


class RenameKeyRequest(BaseModel):
    display_name: str


@router.patch("/keys/{key_id}")
async def rename_key(key_id: str, body: RenameKeyRequest):
    try:
        meta = key_store.rename_key(key_id, body.display_name)
        return meta
    except ValueError:
        raise HTTPException(status_code=404, detail="Key not found")


# ---- Legacy keyfile endpoints (kept for backward compatibility) ----

@router.post("/keyfile")
async def upload_keyfile_legacy(file: UploadFile = File(...)):
    """Legacy endpoint — wraps new key store."""
    contents = await file.read()
    meta = key_store.add_key(contents, file.filename or "key.json")
    project_id = meta.projects[0].id if meta.projects else None
    if project_id:
        updated = cfg.settings.model_copy(update={
            "active_key_id": meta.id,
            "active_project_id": project_id,
        })
        cfg.settings = updated
        cfg.save_settings(updated)
    return {"detail": "Key file uploaded", "project_id": project_id}


@router.delete("/keyfile")
async def delete_keyfile_legacy():
    """Legacy endpoint — removes the active key."""
    key_id = cfg.settings.active_key_id
    if key_id:
        key_store.delete_key(key_id)
    updated = cfg.settings.model_copy(update={
        "service_account_key_path": None,
        "service_account_key_name": None,
        "active_key_id": None,
        "active_project_id": None,
    })
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Key file removed"}


@router.delete("")
async def reset_settings():
    cfg.settings = cfg.AppSettings()
    cfg.save_settings(cfg.settings)
    return {"detail": "Settings reset to defaults"}
