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
