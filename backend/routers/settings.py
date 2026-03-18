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

    # Update settings with the new path
    updated = cfg.settings.model_copy(
        update={"service_account_key_path": str(dest)}
    )
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": "Key file uploaded", "path": str(dest)}


@router.delete("")
async def reset_settings():
    cfg.settings = cfg.AppSettings()
    cfg.save_settings(cfg.settings)
    return {"detail": "Settings reset to defaults"}
