from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from services.gcp_compute import GCPComputeService

router = APIRouter(prefix="/images", tags=["images"])


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


class ImagePatch(BaseModel):
    description: str


@router.get("")
async def list_images():
    svc = _get_service()
    try:
        images = await svc.list_images()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list images: {exc}")
    return images


@router.patch("/{name}")
async def update_image(name: str, body: ImagePatch):
    svc = _get_service()
    try:
        await svc.update_image_description(name, body.description)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update image: {exc}")
    return {"ok": True}
