from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from services.gcp_compute import GCPComputeService

router = APIRouter(tags=["labels"])


class LabelAddRequest(BaseModel):
    key: str
    value: str


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


@router.get("/instances/{zone}/{name}/labels")
async def get_labels(zone: str, name: str):
    svc = _get_service()
    try:
        instance = await svc.get_instance(zone=zone, name=name)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Instance not found: {exc}")
    return instance.labels


@router.post("/instances/{zone}/{name}/labels")
async def add_label(zone: str, name: str, body: LabelAddRequest):
    svc = _get_service()
    try:
        await svc.add_labels(zone=zone, name=name, labels={body.key: body.value})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add label: {exc}")
    return {"detail": f"Label {body.key}={body.value} added to {name}"}


@router.delete("/instances/{zone}/{name}/labels/{key}")
async def remove_label(zone: str, name: str, key: str):
    svc = _get_service()
    try:
        await svc.remove_labels(zone=zone, name=name, label_keys=[key])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to remove label: {exc}")
    return {"detail": f"Label '{key}' removed from {name}"}
