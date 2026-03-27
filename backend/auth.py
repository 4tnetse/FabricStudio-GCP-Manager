import os
from pathlib import Path

from fastapi import HTTPException
from google.oauth2 import service_account

import config as cfg

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
APP_MODE = os.environ.get("APP_MODE", "full")


def get_credentials():
    """Return GCP credentials.

    In Cloud Run (APP_MODE=backend) uses Application Default Credentials.
    In local mode uses the active service account key file.
    """
    if APP_MODE == "backend":
        import google.auth
        creds, _ = google.auth.default(scopes=SCOPES)
        return creds

    # New multi-key path
    active_key_id = cfg.settings.active_key_id
    if active_key_id:
        from services.key_store import get_key_path
        path = get_key_path(active_key_id)
        if path.exists():
            return service_account.Credentials.from_service_account_file(
                str(path), scopes=SCOPES
            )

    # Legacy single-key fallback
    key_path = cfg.settings.service_account_key_path
    if key_path:
        path = Path(key_path)
        if path.exists():
            return service_account.Credentials.from_service_account_file(
                str(path), scopes=SCOPES
            )

    raise HTTPException(
        status_code=400,
        detail="No service account key configured. Please upload a key file in Settings.",
    )
