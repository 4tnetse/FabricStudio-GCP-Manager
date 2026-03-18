from fastapi import APIRouter, HTTPException

import config as cfg
from auth import get_credentials
from models.firewall import TagRequest, TagReplaceRequest
from services.gcp_compute import GCPComputeService

router = APIRouter(tags=["tags"])


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


@router.get("/instances/{zone}/{name}/tags")
async def get_tags(zone: str, name: str):
    svc = _get_service()
    try:
        instance = await svc.get_instance(zone=zone, name=name)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Instance not found: {exc}")
    return instance.tags


@router.post("/instances/{zone}/{name}/tags")
async def add_tag(zone: str, name: str, body: TagRequest):
    svc = _get_service()
    try:
        await svc.add_tags(zone=zone, name=name, tags=[body.tag])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add tag: {exc}")
    return {"detail": f"Tag '{body.tag}' added to {name}"}


@router.delete("/instances/{zone}/{name}/tags/{tag}")
async def remove_tag(zone: str, name: str, tag: str):
    svc = _get_service()
    try:
        await svc.remove_tags(zone=zone, name=name, tags=[tag])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to remove tag: {exc}")
    return {"detail": f"Tag '{tag}' removed from {name}"}


@router.put("/instances/{zone}/{name}/tags")
async def replace_tag(zone: str, name: str, body: TagReplaceRequest):
    svc = _get_service()
    try:
        instance = await svc.get_instance(zone=zone, name=name)
        current_tags = list(instance.tags)
        if body.old_tag not in current_tags:
            raise HTTPException(
                status_code=404,
                detail=f"Tag '{body.old_tag}' not found on instance {name}",
            )
        # Replace old with new
        new_tags = [body.new_tag if t == body.old_tag else t for t in current_tags]
        # Remove old and add new in one round-trip
        await svc.remove_tags(zone=zone, name=name, tags=[body.old_tag])
        await svc.add_tags(zone=zone, name=name, tags=[body.new_tag])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to replace tag: {exc}")
    return {
        "detail": f"Tag '{body.old_tag}' replaced with '{body.new_tag}' on {name}"
    }
