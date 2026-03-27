"""
Schedules router — Phase 1: Firestore CRUD only.
Cloud Scheduler integration added in Phase 4.
Proxy to Cloud Run added in Phase 5.
"""
from fastapi import APIRouter, HTTPException

import config as cfg
from models.schedule import ScheduleCreate, ScheduleUpdate
from services import firestore_client as fs

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _require_scheduling_configured():
    """Raise 503 if Firestore / scheduling is not ready."""
    if not cfg.settings.active_key_id or not cfg.settings.active_project_id:
        raise HTTPException(status_code=503, detail="No active project configured.")


# ---------------------------------------------------------------------------
# Schedule CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_schedules():
    _require_scheduling_configured()
    return await fs.list_schedules()


@router.post("", status_code=201)
async def create_schedule(body: ScheduleCreate):
    _require_scheduling_configured()

    from auth import get_credentials
    from services.key_store import load_keys

    # Resolve client_email for created_by field
    created_by = ""
    keys = load_keys()
    key_meta = next((k for k in keys if k.id == cfg.settings.active_key_id), None)
    if key_meta:
        created_by = key_meta.client_email

    data = {
        **body.model_dump(),
        "project_id": cfg.settings.active_project_id,
        "key_id": cfg.settings.active_key_id,
        "cloud_scheduler_job_name": "",
        "created_by": created_by,
        "settings_snapshot": _build_settings_snapshot(),
    }
    return await fs.create_schedule(data)


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    _require_scheduling_configured()
    run = await fs.get_job_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@router.get("/runs/{run_id}/logs")
async def get_run_logs(run_id: str):
    _require_scheduling_configured()
    run = await fs.get_job_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return {"log_lines": run.get("log_lines", [])}


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str):
    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return schedule


@router.put("/{schedule_id}")
async def update_schedule(schedule_id: str, body: ScheduleUpdate):
    _require_scheduling_configured()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["settings_snapshot"] = _build_settings_snapshot()
    result = await fs.update_schedule(schedule_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return result


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str):
    _require_scheduling_configured()
    found = await fs.delete_schedule(schedule_id)
    if not found:
        raise HTTPException(status_code=404, detail="Schedule not found.")


@router.post("/{schedule_id}/enable")
async def enable_schedule(schedule_id: str):
    _require_scheduling_configured()
    result = await fs.update_schedule(schedule_id, {"enabled": True})
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return result


@router.post("/{schedule_id}/disable")
async def disable_schedule(schedule_id: str):
    _require_scheduling_configured()
    result = await fs.update_schedule(schedule_id, {"enabled": False})
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return result


# ---------------------------------------------------------------------------
# Job runs
# ---------------------------------------------------------------------------

@router.get("/{schedule_id}/runs")
async def list_runs(schedule_id: str):
    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return await fs.list_job_runs(schedule_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_settings_snapshot() -> dict:
    s = cfg.settings
    return {
        "dns_domain": s.dns_domain,
        "instance_fqdn_prefix": s.instance_fqdn_prefix,
        "dns_zone_name": s.dns_zone_name,
        "fs_admin_password": s.fs_admin_password,
        "default_zone": s.default_zone,
        "owner": s.owner,
    }
