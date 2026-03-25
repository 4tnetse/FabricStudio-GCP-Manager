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
    return data


@router.put("")
async def update_settings(update: SettingsUpdate):
    s = cfg.settings
    patch = update.model_dump(exclude_none=True)
    updated = s.model_copy(update=patch)
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Settings saved"}


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
    if not any(k.id == key_id for k in keys):
        raise HTTPException(status_code=404, detail="Key not found")
    key_store.delete_key(key_id)
    # If the active key was deleted, clear it (caller handles project switch)
    if cfg.settings.active_key_id == key_id:
        updated = cfg.settings.model_copy(update={"active_key_id": None, "active_project_id": None})
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
