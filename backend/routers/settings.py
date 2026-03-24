import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File

import config as cfg
from models.settings import SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings():
    s = cfg.settings
    data = s.model_dump()
    # Mask the key path to just the filename for security
    if data.get("service_account_key_path"):
        data["service_account_key_path"] = Path(data["service_account_key_path"]).name
    return data


@router.put("")
async def update_settings(update: SettingsUpdate):
    s = cfg.settings
    patch = update.model_dump(exclude_none=True)
    updated = s.model_copy(update=patch)
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Settings saved"}


@router.post("/keyfile")
async def upload_keyfile(file: UploadFile = File(...)):
    dest = cfg.SETTINGS_DIR / "service-account.json"
    cfg.SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    contents = await file.read()
    dest.write_bytes(contents)

    # Extract project_id from the key file to auto-select the correct project
    project_id = None
    try:
        project_id = json.loads(contents).get("project_id")
    except Exception:
        pass

    updated = cfg.settings.model_copy(
        update={
            "service_account_key_path": str(dest),
            "service_account_key_name": file.filename,
            "active_project_id": project_id,
        }
    )
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Key file uploaded", "path": str(dest), "project_id": project_id}


@router.delete("/keyfile")
async def delete_keyfile():
    key_path = cfg.settings.service_account_key_path
    if key_path:
        try:
            Path(key_path).unlink(missing_ok=True)
        except Exception:
            pass
    updated = cfg.settings.model_copy(update={"service_account_key_path": None, "service_account_key_name": None, "active_project_id": None})
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Key file removed"}


@router.delete("")
async def reset_settings():
    cfg.settings = cfg.AppSettings()
    cfg.save_settings(cfg.settings)
    return {"detail": "Settings reset to defaults"}
