from fastapi import APIRouter, HTTPException

import config as cfg
from auth import get_credentials
from services.gcp_compute import GCPComputeService

router = APIRouter(prefix="/images", tags=["images"])


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


@router.get("")
async def list_images():
    svc = _get_service()
    try:
        images = await svc.list_images()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list images: {exc}")
    return images
