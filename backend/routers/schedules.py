"""
Schedules router.
Phase 1: Firestore CRUD.
Phase 3: Trigger endpoint (runs job + writes logs to Firestore).
Phase 4: Cloud Scheduler integration.
Phase 5: Proxy to Cloud Run.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

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
    schedule = await fs.create_schedule(data)

    # Create Cloud Scheduler job if remote scheduling is enabled
    scheduler_warning = None
    if cfg.settings.remote_scheduling_enabled and cfg.settings.remote_backend_url:
        try:
            from services.cloud_scheduler import create_scheduler_job
            job_name = await create_scheduler_job(schedule)
            schedule = await fs.update_schedule(schedule["id"], {"cloud_scheduler_job_name": job_name})
        except Exception as exc:
            scheduler_warning = f"Schedule saved but Cloud Scheduler job creation failed: {exc}"

    result = schedule or data
    if scheduler_warning:
        result = {**result, "_warning": scheduler_warning}
    return result


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

    # Sync Cloud Scheduler job if it exists
    job_name = result.get("cloud_scheduler_job_name", "")
    if job_name and cfg.settings.remote_scheduling_enabled:
        try:
            from services.cloud_scheduler import update_scheduler_job
            await update_scheduler_job(result)
        except Exception:
            pass  # best-effort

    return result


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str):
    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    # Delete Cloud Scheduler job first (best-effort)
    job_name = schedule.get("cloud_scheduler_job_name", "")
    if job_name:
        try:
            from services.cloud_scheduler import delete_scheduler_job
            await delete_scheduler_job(job_name)
        except Exception:
            pass

    await fs.delete_schedule(schedule_id)


@router.post("/{schedule_id}/enable")
async def enable_schedule(schedule_id: str):
    _require_scheduling_configured()
    result = await fs.update_schedule(schedule_id, {"enabled": True})
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    job_name = result.get("cloud_scheduler_job_name", "")
    if job_name:
        try:
            from services.cloud_scheduler import resume_scheduler_job
            await resume_scheduler_job(job_name)
        except Exception:
            pass
    return result


@router.post("/{schedule_id}/disable")
async def disable_schedule(schedule_id: str):
    _require_scheduling_configured()
    result = await fs.update_schedule(schedule_id, {"enabled": False})
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    job_name = result.get("cloud_scheduler_job_name", "")
    if job_name:
        try:
            from services.cloud_scheduler import pause_scheduler_job
            await pause_scheduler_job(job_name)
        except Exception:
            pass
    return result


# ---------------------------------------------------------------------------
# Trigger (called by Cloud Scheduler or "Run now" from the UI)
# ---------------------------------------------------------------------------

@router.post("/{schedule_id}/trigger", status_code=202)
async def trigger_schedule(schedule_id: str, background_tasks: BackgroundTasks):
    """Execute a schedule immediately.

    Returns 202 Accepted immediately; the job runs in the background and
    writes its logs + final status to the job_runs Firestore collection.
    """
    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    # Create a job_run document (status=running)
    run_data = {
        "schedule_id": schedule_id,
        "schedule_name": schedule.get("name", ""),
        "job_type": schedule.get("job_type", ""),
        "triggered_by": "manual",
        "project_id": schedule.get("project_id", ""),
        "log_lines": [],
        "error_summary": None,
        "finished_at": None,
    }
    run = await fs.create_job_run(run_data)
    run_id = run["id"]

    # Import here to avoid circular imports at module load time
    from services.schedule_runner import run_triggered_job
    background_tasks.add_task(run_triggered_job, schedule, run_id)

    return {"run_id": run_id, "schedule_id": schedule_id}


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
