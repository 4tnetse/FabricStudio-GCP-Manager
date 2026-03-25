from fastapi import APIRouter
from pydantic import BaseModel

import config as cfg
from services import key_store

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectSelectRequest(BaseModel):
    project_id: str


@router.get("")
async def list_projects():
    active = cfg.settings.active_project_id
    projects = key_store.all_projects_annotated()
    for p in projects:
        p["is_selected"] = p["id"] == active
    return projects


@router.post("/select")
async def select_project(body: ProjectSelectRequest):
    # Find which key owns this project
    key_meta = key_store.find_key_for_project(body.project_id)
    key_id = key_meta.id if key_meta else cfg.settings.active_key_id
    updated = cfg.settings.model_copy(update={
        "active_project_id": body.project_id,
        "active_key_id": key_id,
    })
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": f"Active project set to {body.project_id}"}
