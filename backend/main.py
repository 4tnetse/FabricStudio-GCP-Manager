import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import config as cfg
from auth import get_credentials
from services.gcp_billing import refresh_fallback_prices
from services.parallel_runner import JobManager as _JobManager

APP_MODE = os.environ.get("APP_MODE", "full")  # "full" or "backend"
from routers import (
    cloud_run,
    configs,
    costs,
    firewall,
    images,
    instances,
    labels,
    operations,
    projects,
    schedules,
    settings,
    ssh,
    tags,
)


async def _daily_price_refresh():
    """Background task: refresh fallback pricing table immediately, then every 24 hours."""
    while True:
        try:
            creds = get_credentials()
        except Exception:
            creds = None
        await refresh_fallback_prices(creds)
        await asyncio.sleep(24 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load settings on startup
    cfg.settings = cfg.load_settings()

    # Migrate legacy single-key setup
    from services import key_store
    if cfg.settings.service_account_key_path and not key_store.load_keys():
        from services.key_store import migrate_from_legacy
        meta = migrate_from_legacy(
            cfg.settings.service_account_key_path,
            cfg.settings.service_account_key_name,
        )
        if meta:
            project_id = cfg.settings.active_project_id or (meta.projects[0].id if meta.projects else None)
            updated = cfg.settings.model_copy(update={
                "active_key_id": meta.id,
                "active_project_id": project_id,
            })
            cfg.settings = updated
            cfg.save_settings(updated)

    # Migrate legacy top-level preference fields into project_configs
    migrated = cfg.migrate_legacy_preferences(cfg.settings)
    # Clear fields that had hardcoded defaults but should now be blank
    migrated = cfg.migrate_legacy_defaults(migrated)
    if migrated is not cfg.settings:
        cfg.settings = migrated
        cfg.save_settings(migrated)

    if APP_MODE == "full":
        asyncio.create_task(_daily_price_refresh())
    yield


app = FastAPI(
    title="Fabric Studio GCP Management API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


# Include all routers under /api prefix
app.include_router(settings.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(instances.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(firewall.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(ssh.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(configs.router, prefix="/api")
app.include_router(costs.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(cloud_run.router)


_DOCS_DIR = Path(__file__).parent.parent / "site"
if _DOCS_DIR.exists():
    @app.get("/manual", include_in_schema=False)
    async def docs_redirect():
        return RedirectResponse(url="/manual/")
    app.mount("/manual", StaticFiles(directory=_DOCS_DIR, html=True), name="docs")

_VERSION_FILE = Path(__file__).parent.parent / "VERSION"

# Cache remote version to avoid hitting the Cloud Run API on every request
_remote_version_cache: dict = {"version": None, "expires": 0.0}
# Cache ghcr.io image availability check (per version, 60 seconds)
_image_available_cache: dict = {"available": None, "version": None, "expires": 0.0}

_upgrade_manager = _JobManager()


def _read_local_version() -> str:
    return _VERSION_FILE.read_text().splitlines()[0].strip() if _VERSION_FILE.exists() else "0.0"


async def _fetch_remote_version() -> str | None:
    """Fetch the image tag of the running fabricstudio-scheduler Cloud Run service."""
    import time
    import asyncio

    now = time.monotonic()
    if _remote_version_cache["version"] is not None and now < _remote_version_cache["expires"]:
        return _remote_version_cache["version"]

    project_id = cfg.settings.active_project_id
    sched = cfg.get_project_scheduling(cfg.settings, project_id)
    region = sched.get("cloud_run_region") or ""
    if not region or not project_id:
        return None

    def _run() -> str | None:
        try:
            from google.cloud import run_v2
            client = run_v2.ServicesClient(credentials=get_credentials())
            name = f"projects/{project_id}/locations/{region}/services/fabricstudio-scheduler"
            service = client.get_service(name=name)
            image = service.template.containers[0].image if service.template.containers else ""
            # Extract tag from image URI e.g. ".../fabricstudio-gcp-manager:v2.0" → "2.0"
            tag = image.split(":")[-1].lstrip("v") if ":" in image else None
            return tag
        except Exception:
            return None

    try:
        version = await asyncio.get_event_loop().run_in_executor(None, _run)
        _remote_version_cache["version"] = version
        _remote_version_cache["expires"] = now + 300  # cache for 5 minutes
        return version
    except Exception:
        return None


async def _check_image_available(version: str) -> bool:
    """Check if the Docker image for this version exists on ghcr.io, cached for 60 seconds."""
    import time

    now = time.monotonic()
    if (
        _image_available_cache["version"] == version
        and _image_available_cache["available"] is not None
        and now < _image_available_cache["expires"]
    ):
        return _image_available_cache["available"]

    def _run() -> bool:
        try:
            import urllib.request
            import urllib.error
            import json

            owner = "4tnetse"
            image = "fabricstudio-gcp-manager"
            tag = f"v{version}"

            # Get anonymous pull token from ghcr.io
            token_req = urllib.request.Request(
                f"https://ghcr.io/token?service=ghcr.io&scope=repository:{owner}/{image}:pull",
                headers={"User-Agent": "fabricstudio-gcp-manager"},
            )
            with urllib.request.urlopen(token_req, timeout=5) as resp:
                token = json.loads(resp.read().decode()).get("token", "")

            # HEAD request for the manifest
            manifest_req = urllib.request.Request(
                f"https://ghcr.io/v2/{owner}/{image}/manifests/{tag}",
                headers={
                    "User-Agent": "fabricstudio-gcp-manager",
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.oci.image.manifest.v1+json",
                },
            )
            manifest_req.get_method = lambda: "HEAD"
            with urllib.request.urlopen(manifest_req, timeout=5):
                return True
        except urllib.error.HTTPError:
            return False
        except Exception:
            return False

    try:
        available = await asyncio.get_event_loop().run_in_executor(None, _run)
        _image_available_cache["available"] = available
        _image_available_cache["version"] = version
        _image_available_cache["expires"] = now + 60
        return available
    except Exception:
        return False


@app.get("/api/health")
async def health():
    version = _read_local_version()
    return {"status": "ok", "active_project": cfg.settings.active_project_id, "version": version}


@app.get("/api/version")
async def version_info():
    local = _read_local_version()
    _sched = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    remote_configured = bool(_sched.get("cloud_run_region") and cfg.settings.active_project_id)
    remote, image_available = await asyncio.gather(
        _fetch_remote_version() if remote_configured else asyncio.sleep(0, result=None),
        _check_image_available(local),
    )
    return {
        "local_version": local,
        "remote_version": remote,
        "remote_configured": remote_configured,
        "image_available": image_available,
    }


@app.post("/api/version/upgrade-remote")
async def upgrade_remote():
    """Start a Cloud Run upgrade job. Returns upgrade_id for SSE streaming."""
    local = _read_local_version()
    project_id = cfg.settings.active_project_id
    _sched2 = cfg.get_project_scheduling(cfg.settings, project_id)
    region = _sched2.get("cloud_run_region") or ""

    if not region or not project_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Cloud Run region or project not configured.")

    upgrade_id = str(uuid.uuid4())
    q = _upgrade_manager.create_job(upgrade_id)
    asyncio.create_task(_run_upgrade(upgrade_id, q, project_id, region, local))
    return {"upgrade_id": upgrade_id}


@app.get("/api/version/upgrade-remote/{upgrade_id}/stream")
async def stream_upgrade(upgrade_id: str):
    """SSE log stream for a running upgrade job."""
    async def generator():
        async for chunk in _upgrade_manager.stream_job(upgrade_id):
            yield chunk

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_REMOTE_PREFERENCE_FIELDS = {
    "initials", "default_zone", "default_type", "owner", "group",
    "ssh_public_key", "dns_domain", "instance_fqdn_prefix", "dns_zone_name",
    "fs_admin_password",
}


async def _push_settings_to_remote(remote_url: str, project_id: str, log) -> None:
    """Push per-project settings snapshot to the newly upgraded remote backend."""
    import httpx
    from services.id_token import get_id_token

    pc = cfg.get_project_config(cfg.settings, project_id)
    sched = cfg.get_project_scheduling(cfg.settings, project_id)

    payload: dict = {k: v for k, v in pc.items() if k in _REMOTE_PREFERENCE_FIELDS and v}
    payload["active_project_id"] = project_id
    if sched.get("firestore_project_id"):
        payload["firestore_project_id"] = sched["firestore_project_id"]

    try:
        token = await get_id_token(remote_url)
    except Exception as exc:
        await log(f"⚠  Could not obtain auth token for settings push: {exc}")
        return

    base = remote_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    await log("Waiting for new backend to be ready…")
    async with httpx.AsyncClient(timeout=10.0) as client:
        for _ in range(24):  # up to 2 minutes
            try:
                r = await client.get(f"{base}/api/health", headers=headers)
                if r.is_success:
                    break
            except Exception:
                pass
            await asyncio.sleep(5)
        else:
            await log("⚠  Remote backend did not become ready in time — settings not pushed")
            return

        try:
            r = await client.put(f"{base}/api/settings", json=payload, headers=headers)
            if r.is_success:
                await log("✓ Settings pushed to remote backend")
            else:
                await log(f"⚠  Settings push returned HTTP {r.status_code} — check remote backend logs")
        except Exception as exc:
            await log(f"⚠  Settings push failed: {exc}")


async def _run_upgrade(upgrade_id: str, q: asyncio.Queue, project_id: str, region: str, version: str):
    loop = asyncio.get_event_loop()

    async def log(msg: str):
        await q.put(msg)

    try:
        credentials = get_credentials()

        # Step 1 — Ensure Cloud Build API is enabled (may not be if this is a first upgrade on this project)
        await log("Ensuring Cloud Build API is enabled...")
        from routers.cloud_run import _enable_apis
        await loop.run_in_executor(None, _enable_apis, credentials, project_id)
        await log("✓ APIs ready")

        # Step 2 — Copy image to GCR via Cloud Build (same as deploy)
        await log(f"Copying container image to gcr.io/{project_id} (v{version}) via Cloud Build (this may take a few minutes)...")
        from routers.cloud_run import _copy_image_to_gcr
        image = await loop.run_in_executor(None, _copy_image_to_gcr, credentials, project_id, version)
        await log(f"✓ Image ready: {image}")

        # Step 3 — Update Cloud Run service
        await log("Updating Cloud Run service 'fabricstudio-scheduler'...")

        def _update():
            from google.cloud import run_v2
            from google.protobuf import field_mask_pb2
            client = run_v2.ServicesClient(credentials=credentials)
            name = f"projects/{project_id}/locations/{region}/services/fabricstudio-scheduler"
            service = client.get_service(name=name)
            service.template.containers[0].image = image
            update_mask = field_mask_pb2.FieldMask(paths=["template"])
            client.update_service(service=service, update_mask=update_mask).result(timeout=300)

        await loop.run_in_executor(None, _update)
        await log("✓ Cloud Run updated successfully")

        # Invalidate remote version cache
        _remote_version_cache["version"] = None
        _remote_version_cache["expires"] = 0.0

        # Step 4 — Push settings snapshot to the newly upgraded backend
        sched = cfg.get_project_scheduling(cfg.settings, project_id)
        remote_url = sched.get("remote_backend_url", "")
        if remote_url:
            await _push_settings_to_remote(remote_url, project_id, log)
        else:
            await log("⚠  Remote backend URL not set — skipping settings push")

        await _upgrade_manager.mark_done(upgrade_id)

    except Exception as exc:
        await log(f"✗ Upgrade failed: {exc}")
        await _upgrade_manager.mark_done(upgrade_id, failed=True)


_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if APP_MODE == "full" and _FRONTEND_DIST.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("manual"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        file_path = _FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
