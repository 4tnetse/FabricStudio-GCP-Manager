"""
Workshops router — CRUD for workshop deployments.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

import config as cfg
from services import firestore_client as fs

router = APIRouter(prefix="/workshops", tags=["workshops"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WorkshopCreate(BaseModel):
    name: str
    passphrase: str
    guest_password: str
    hostname_template: str = ""
    fabric_workspace: str = ""
    doc_link: str = ""
    source_image: str
    machine_type: str
    zone: str
    count_start: int = 1
    count_end: int = 1
    start_time: str | None = None
    end_time: str | None = None


class WorkshopUpdate(BaseModel):
    name: str | None = None
    passphrase: str | None = None
    guest_password: str | None = None
    hostname_template: str | None = None
    fabric_workspace: str | None = None
    doc_link: str | None = None
    source_image: str | None = None
    machine_type: str | None = None
    zone: str | None = None
    count_start: int | None = None
    count_end: int | None = None
    start_time: str | None = None
    end_time: str | None = None
    status: str | None = None
    portal_enabled: bool | None = None
    portal_url: str | None = None
    current_activity: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_project() -> str:
    project_id = cfg.settings.active_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No active project configured.")
    return project_id


# ---------------------------------------------------------------------------
# Workshop CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_workshops():
    project_id = _require_project()
    return await fs.list_workshops(project_id=project_id)


@router.post("", status_code=201)
async def create_workshop(body: WorkshopCreate):
    project_id = _require_project()
    data = {
        **body.model_dump(),
        "project_id": project_id,
        "status": "draft",
        "portal_enabled": False,
        "portal_url": None,
        "current_activity": None,
    }
    return await fs.create_workshop(data)


@router.get("/{workshop_id}")
async def get_workshop(workshop_id: str):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return workshop


@router.put("/{workshop_id}")
async def update_workshop(workshop_id: str, body: WorkshopUpdate):
    _require_project()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await fs.update_workshop(workshop_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return result


@router.delete("/{workshop_id}", status_code=204)
async def delete_workshop(workshop_id: str):
    _require_project()
    deleted = await fs.delete_workshop(workshop_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workshop not found.")


# ---------------------------------------------------------------------------
# Attendees
# ---------------------------------------------------------------------------

@router.get("/{workshop_id}/attendees")
async def list_attendees(workshop_id: str):
    _require_project()
    workshop = await fs.get_workshop(workshop_id)
    if workshop is None:
        raise HTTPException(status_code=404, detail="Workshop not found.")
    return await fs.list_attendees(workshop_id)


@router.delete("/{workshop_id}/attendees/{attendee_id}", status_code=204)
async def remove_attendee(workshop_id: str, attendee_id: str):
    _require_project()
    deleted = await fs.delete_attendee(workshop_id, attendee_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Attendee not found.")
