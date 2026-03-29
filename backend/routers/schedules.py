"""
Schedules router.
Phase 1: Firestore CRUD.
Phase 3: Trigger endpoint (runs job + writes logs to Firestore).
Phase 4: Cloud Scheduler integration.
Phase 5: Proxy layer (local → Cloud Run) + cloud-run-url auto-detect.
"""
import asyncio
import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import Response

logger = logging.getLogger(__name__)

import config as cfg
from models.schedule import ScheduleCreate, ScheduleUpdate
from services import firestore_client as fs

router = APIRouter(prefix="/schedules", tags=["schedules"])


# ---------------------------------------------------------------------------
# Proxy helpers (Phase 5)
# ---------------------------------------------------------------------------

async def _maybe_proxy(request: Request, extra_params: dict | None = None) -> Response | None:
    """If remote scheduling is enabled, forward to Cloud Run and return the response.

    Returns None to indicate that local handling should proceed.
    Returns a Response when the proxy handled the request.
    Raises HTTPException 503 if remote scheduling is enabled but not fully configured.
    """
    sched = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    if not sched.get("remote_scheduling_enabled"):
        return None

    backend_url = sched.get("remote_backend_url", "")
    if not backend_url:
        raise HTTPException(
            status_code=503,
            detail="Remote scheduling is enabled but Remote Backend URL is not configured.",
        )

    from services.id_token import get_id_token
    try:
        token = await get_id_token(backend_url)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to generate ID token for Cloud Run: {exc}",
        )

    # Build the target URL (keep the same path + query string, append extra_params)
    path = request.url.path
    query = str(request.url.query)
    target = f"{backend_url.rstrip('/')}{path}"
    if extra_params:
        from urllib.parse import urlencode
        extra_qs = urlencode(extra_params)
        query = f"{query}&{extra_qs}" if query else extra_qs
    if query:
        target += f"?{query}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Triggered-By": "manual",
    }
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.request(
                method=request.method,
                url=target,
                headers=headers,
                content=body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach Cloud Run backend: {exc}",
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


def _require_scheduling_configured():
    """Raise 503 if scheduling cannot proceed.

    In backend (Cloud Run) mode ADC handles auth — no settings check needed.
    In full mode both active_key_id and active_project_id must be set.
    """
    import os
    if os.environ.get("APP_MODE") == "backend":
        return
    if not cfg.settings.active_key_id or not cfg.settings.active_project_id:
        raise HTTPException(status_code=503, detail="No active project configured.")


# ---------------------------------------------------------------------------
# Cloud Run URL auto-detection (local-only — never proxied)
# ---------------------------------------------------------------------------

@router.get("/cloud-run-url")
async def get_cloud_run_url():
    """Query the Cloud Run API to find the URL and region of 'fabricstudio-scheduler'.

    Uses the locations/- wildcard to search all regions at once.
    """
    _require_scheduling_configured()

    project_id = cfg.settings.active_project_id
    loop = asyncio.get_event_loop()

    def _run() -> dict:
        from auth import get_credentials
        from google.cloud import run_v2

        creds = get_credentials()
        client = run_v2.ServicesClient(credentials=creds)
        # Use '-' wildcard to search all regions in one call
        parent = f"projects/{project_id}/locations/-"
        for service in client.list_services(parent=parent):
            if service.name.endswith("/fabricstudio-scheduler"):
                # service.name format: projects/P/locations/REGION/services/NAME
                parts = service.name.split("/")
                region = parts[3] if len(parts) > 3 else ""
                return {"url": service.uri, "region": region}
        raise ValueError(
            "Service 'fabricstudio-scheduler' not found in any region. "
            "Deploy it first with APP_MODE=backend."
        )

    try:
        return await loop.run_in_executor(None, _run)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Schedule CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_schedules(project_id: str | None = None):
    import os as _os
    _require_scheduling_configured()
    effective_project_id = project_id if _os.environ.get("APP_MODE") == "backend" else cfg.settings.active_project_id
    return await fs.list_schedules(project_id=effective_project_id or None)


@router.post("", status_code=201)
async def create_schedule(body: ScheduleCreate, request: Request):
    # Build settings snapshot locally (before proxying — Cloud Run has no local settings)
    if body.settings_snapshot is None:
        body = body.model_copy(update={"settings_snapshot": _build_settings_snapshot()})

    _sched = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    if _sched.get("remote_scheduling_enabled"):
        _backend_url = _sched.get("remote_backend_url", "")
        if not _backend_url:
            raise HTTPException(
                status_code=503,
                detail="Remote scheduling is enabled but Remote Backend URL is not configured.",
            )
        from services.id_token import get_id_token
        import json as _json
        try:
            token = await get_id_token(_backend_url)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Failed to generate ID token for Cloud Run: {exc}")

        path = request.url.path
        query = str(request.url.query)
        target = f"{_backend_url.rstrip('/')}{path}"
        if query:
            target += f"?{query}"

        import httpx as _httpx
        try:
            async with _httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    target,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "X-Triggered-By": "manual"},
                    content=_json.dumps(body.model_dump()).encode(),
                )
        except _httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach Cloud Run backend: {exc}")
        return Response(content=resp.content, status_code=resp.status_code,
                        media_type=resp.headers.get("content-type", "application/json"))

    _require_scheduling_configured()

    from services.key_store import load_keys

    project_id = body.project_id or cfg.settings.active_project_id or ""
    key_id = cfg.settings.active_key_id or ""

    created_by = ""
    keys = load_keys()
    key_meta = next((k for k in keys if k.id == key_id), None)
    if key_meta:
        created_by = key_meta.client_email

    body_data = body.model_dump()
    body_data.pop("project_id", None)   # don't store the injected field in Firestore
    data = {
        **body_data,
        "project_id": project_id,
        "key_id": key_id,
        "cloud_scheduler_job_name": "",
        "created_by": created_by,
        "settings_snapshot": body.settings_snapshot if body.settings_snapshot else _build_settings_snapshot(),
    }
    schedule = await fs.create_schedule(data)

    import os as _os
    scheduler_warning = None
    _is_backend = _os.environ.get("APP_MODE") == "backend"
    logger.info("create_schedule: APP_MODE=%s is_backend=%s", _os.environ.get("APP_MODE"), _is_backend)
    _sched_check = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    if _is_backend or (_sched_check.get("remote_scheduling_enabled") and _sched_check.get("remote_backend_url")):
        try:
            from services.cloud_scheduler import create_scheduler_job
            job_name = await create_scheduler_job(schedule)
            schedule = await fs.update_schedule(schedule["id"], {"cloud_scheduler_job_name": job_name})
            logger.info("create_schedule: Cloud Scheduler job created: %s", job_name)
        except Exception as exc:
            scheduler_warning = f"Schedule saved but Cloud Scheduler job creation failed: {exc}"
            logger.error("create_schedule: Cloud Scheduler job creation failed: %s", exc)

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
async def update_schedule(schedule_id: str, body: ScheduleUpdate, request: Request):
    if (resp := await _maybe_proxy(request)):
        return resp
    _require_scheduling_configured()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["settings_snapshot"] = _build_settings_snapshot()
    result = await fs.update_schedule(schedule_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    job_name = result.get("cloud_scheduler_job_name", "")
    if job_name:
        try:
            from services.cloud_scheduler import update_scheduler_job
            await update_scheduler_job(result)
        except Exception:
            pass

    return result


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str, request: Request):
    if (resp := await _maybe_proxy(request)):
        return resp
    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    job_name = schedule.get("cloud_scheduler_job_name", "")
    if job_name:
        try:
            from services.cloud_scheduler import delete_scheduler_job
            await delete_scheduler_job(job_name)
        except Exception:
            pass

    await fs.delete_schedule(schedule_id)


@router.post("/{schedule_id}/enable")
async def enable_schedule(schedule_id: str, request: Request):
    if (resp := await _maybe_proxy(request)):
        return resp
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
async def disable_schedule(schedule_id: str, request: Request):
    if (resp := await _maybe_proxy(request)):
        return resp
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
# Trigger (Cloud Scheduler → Cloud Run, or manual "Run now")
# ---------------------------------------------------------------------------

@router.post("/{schedule_id}/trigger", status_code=202)
async def trigger_schedule(schedule_id: str, background_tasks: BackgroundTasks, request: Request):
    """Execute a schedule immediately.

    When called via the UI (manual trigger), proxies to Cloud Run if remote
    scheduling is enabled. When called directly by Cloud Scheduler on Cloud Run,
    runs the job in the background and writes logs to Firestore.
    """
    if (resp := await _maybe_proxy(request)):
        return resp

    _require_scheduling_configured()
    schedule = await fs.get_schedule(schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    run_data = {
        "schedule_id": schedule_id,
        "schedule_name": schedule.get("name", ""),
        "job_type": schedule.get("job_type", ""),
        "triggered_by": "manual" if request.headers.get("X-Triggered-By") == "manual" else "scheduler",
        "project_id": schedule.get("project_id", ""),
        "log_lines": [],
        "error_summary": None,
        "finished_at": None,
    }
    run = await fs.create_job_run(run_data)
    run_id = run["id"]

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
    # Use per-project config (authoritative) rather than legacy top-level fields
    p = cfg.get_project_config(cfg.settings, cfg.settings.active_project_id)
    return {
        "dns_domain": p.get("dns_domain") or "",
        "instance_fqdn_prefix": p.get("instance_fqdn_prefix") or "",
        "dns_zone_name": p.get("dns_zone_name") or "",
        "fs_admin_password": p.get("fs_admin_password") or "",
        "default_zone": p.get("default_zone") or "",
        "owner": p.get("owner") or "",
    }
