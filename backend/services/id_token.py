"""
ID token generation for authenticating local backend → Cloud Run requests.

Uses the active service account key to generate a short-lived ID token
targeting the Cloud Run service URL. Tokens are cached for up to 55 minutes
(Cloud Run tokens are valid for 1 hour; we refresh 5 minutes early).
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

import config as cfg

_cached_token: str | None = None
_token_expiry: datetime | None = None
_cache_lock = asyncio.Lock()

APP_MODE = os.environ.get("APP_MODE", "full")


async def get_id_token(audience: str) -> str:
    """Return a valid ID token for the given audience URL.

    Refreshes from the service account key file when expired or missing.
    """
    global _cached_token, _token_expiry

    async with _cache_lock:
        now = datetime.now(tz=timezone.utc)
        if _cached_token and _token_expiry and (_token_expiry - now) > timedelta(minutes=5):
            return _cached_token

        token = await _fetch_id_token(audience)
        _cached_token = token
        _token_expiry = now + timedelta(hours=1)
        return token


async def _fetch_id_token(audience: str) -> str:
    loop = asyncio.get_event_loop()

    def _run() -> str:
        if APP_MODE == "backend":
            # In Cloud Run itself, use ADC-based ID token
            import google.auth.transport.requests
            import google.oauth2.id_token
            request = google.auth.transport.requests.Request()
            return google.oauth2.id_token.fetch_id_token(request, audience)

        # Local mode: use the active service account key file
        key_id = cfg.settings.active_key_id
        if not key_id:
            raise RuntimeError("No active key configured.")
        from services.key_store import get_key_path
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account as sa

        key_path = get_key_path(key_id)
        creds = sa.IDTokenCredentials.from_service_account_file(
            str(key_path), target_audience=audience
        )
        creds.refresh(Request())
        return creds.token

    return await loop.run_in_executor(None, _run)


def invalidate_cache() -> None:
    """Call this when the active key changes so the next request re-fetches."""
    global _cached_token, _token_expiry
    _cached_token = None
    _token_expiry = None
