import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config as cfg
from services.gcp_billing import refresh_fallback_prices
from routers import (
    configs,
    costs,
    firewall,
    images,
    instances,
    labels,
    operations,
    projects,
    settings,
    ssh,
    tags,
)


async def _daily_price_refresh():
    """Background task: refresh fallback pricing table immediately, then every 24 hours."""
    while True:
        await refresh_fallback_prices()
        await asyncio.sleep(24 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load settings on startup
    cfg.settings = cfg.load_settings()
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


_VERSION_FILE = Path(__file__).parent.parent / "VERSION"


@app.get("/api/health")
async def health():
    version = _VERSION_FILE.read_text().splitlines()[0].strip() if _VERSION_FILE.exists() else "0.000"
    return {"status": "ok", "active_project": cfg.settings.active_project_id, "version": version}
