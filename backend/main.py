import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import config as cfg
from auth import get_credentials
from services.gcp_billing import refresh_fallback_prices

APP_MODE = os.environ.get("APP_MODE", "full")  # "full" or "backend"
from routers import (
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


_DOCS_DIR = Path(__file__).parent.parent / "site"
if _DOCS_DIR.exists():
    @app.get("/manual", include_in_schema=False)
    async def docs_redirect():
        return RedirectResponse(url="/manual/")
    app.mount("/manual", StaticFiles(directory=_DOCS_DIR, html=True), name="docs")

_VERSION_FILE = Path(__file__).parent.parent / "VERSION"

# Cache remote version to avoid hitting the Cloud Run API on every request
_remote_version_cache: dict = {"version": None, "expires": 0.0}


def _read_local_version() -> str:
    return _VERSION_FILE.read_text().splitlines()[0].strip() if _VERSION_FILE.exists() else "0.0"


async def _fetch_remote_version() -> str | None:
    """Fetch the image tag of the running fabricstudio-scheduler Cloud Run service."""
    import time
    import asyncio

    now = time.monotonic()
    if _remote_version_cache["version"] is not None and now < _remote_version_cache["expires"]:
        return _remote_version_cache["version"]

    region = cfg.settings.cloud_run_region
    project_id = cfg.settings.active_project_id
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


@app.get("/api/health")
async def health():
    version = _read_local_version()
    return {"status": "ok", "active_project": cfg.settings.active_project_id, "version": version}


@app.get("/api/version")
async def version_info():
    local = _read_local_version()
    remote_configured = bool(cfg.settings.cloud_run_region and cfg.settings.active_project_id)
    remote = await _fetch_remote_version() if remote_configured else None
    return {
        "local_version": local,
        "remote_version": remote,
        "remote_configured": remote_configured,
    }


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
