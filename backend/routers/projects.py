import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config as cfg
from auth import get_credentials

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectSelectRequest(BaseModel):
    project_id: str


def _project_from_key_file() -> dict | None:
    """Extract the project_id baked into the service account JSON key."""
    key_path = cfg.settings.service_account_key_path
    if not key_path:
        return None
    try:
        data = json.loads(Path(key_path).read_text())
        project_id = data.get("project_id")
        if project_id:
            return {"id": project_id, "name": project_id, "state": "ACTIVE"}
    except Exception:
        pass
    return None


@router.get("")
async def list_projects():
    credentials = get_credentials()
    from google.cloud import resourcemanager_v3

    client = resourcemanager_v3.ProjectsClient(credentials=credentials)

    projects = []
    try:
        for project in client.search_projects():
            projects.append(
                {
                    "id": project.project_id,
                    "name": project.display_name,
                    "state": project.state.name if project.state else "UNKNOWN",
                }
            )
    except Exception:
        # Cloud Resource Manager API may be disabled — fall back to the
        # project embedded in the service account key file itself.
        fallback = _project_from_key_file()
        if fallback:
            projects = [fallback]
        else:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Could not list projects. Enable the Cloud Resource Manager API at "
                    "https://console.developers.google.com/apis/api/cloudresourcemanager.googleapis.com "
                    "or ensure your service account has resourcemanager.projects.list permission."
                ),
            )

    # Mark the active project
    active = cfg.settings.active_project_id
    for p in projects:
        p["is_selected"] = p["id"] == active

    return projects


@router.post("/select")
async def select_project(body: ProjectSelectRequest):
    updated = cfg.settings.model_copy(
        update={"active_project_id": body.project_id}
    )
    cfg.settings = updated
    cfg.save_settings(updated)
    return {"detail": f"Active project set to {body.project_id}"}
