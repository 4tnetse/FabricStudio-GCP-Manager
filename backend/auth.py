from pathlib import Path

from fastapi import HTTPException
from google.oauth2 import service_account

import config as cfg

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def get_credentials() -> service_account.Credentials:
    key_path = cfg.settings.service_account_key_path
    if not key_path:
        raise HTTPException(
            status_code=400,
            detail="Service account key path is not configured. Please upload a key file in Settings.",
        )
    path = Path(key_path)
    if not path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Service account key file not found: {key_path}",
        )
    return service_account.Credentials.from_service_account_file(
        str(path), scopes=SCOPES
    )
