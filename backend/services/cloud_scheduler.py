"""
Cloud Scheduler integration.

Creates / updates / deletes Cloud Scheduler jobs that call
POST /api/schedules/{id}/trigger on the Cloud Run backend.

The Cloud Run service must be deployed as "fabricstudio-scheduler" and the
caller service account needs roles/cloudscheduler.admin.
"""
import asyncio
import os
from typing import Any

from google.cloud import scheduler_v1
from google.oauth2 import service_account

import config as cfg

APP_MODE = os.environ.get("APP_MODE", "full")


def _get_client() -> scheduler_v1.CloudSchedulerClient:
    """Return an authenticated Cloud Scheduler client."""
    if APP_MODE == "backend":
        return scheduler_v1.CloudSchedulerClient()

    key_id = cfg.settings.active_key_id
    if not key_id:
        raise RuntimeError("No active key configured.")
    from services.key_store import get_key_path
    key_path = get_key_path(key_id)
    creds = service_account.Credentials.from_service_account_file(str(key_path))
    return scheduler_v1.CloudSchedulerClient(credentials=creds)


def _location_path(project_id: str, region: str) -> str:
    return f"projects/{project_id}/locations/{region}"


def _job_name(project_id: str, region: str, schedule_id: str) -> str:
    return f"{_location_path(project_id, region)}/jobs/fabricstudio-schedule-{schedule_id}"


def _build_job_body(
    schedule_id: str,
    project_id: str,
    region: str,
    backend_url: str,
    sa_email: str,
    cron_expression: str,
    timezone: str,
    enabled: bool,
) -> dict[str, Any]:
    trigger_url = f"{backend_url.rstrip('/')}/api/schedules/{schedule_id}/trigger"
    return {
        "name": _job_name(project_id, region, schedule_id),
        "schedule": cron_expression,
        "time_zone": timezone,
        "http_target": {
            "uri": trigger_url,
            "http_method": scheduler_v1.HttpMethod.POST,
            "headers": {"Content-Type": "application/json"},
            "body": b"{}",
            "oidc_token": {
                "service_account_email": sa_email,
                "audience": backend_url,
            },
        },
        "state": scheduler_v1.Job.State.ENABLED if enabled else scheduler_v1.Job.State.PAUSED,
    }


def _resolve_backend_url() -> str:
    """Return the Cloud Run backend URL, falling back to BACKEND_URL env var."""
    return cfg.settings.remote_backend_url or os.environ.get("BACKEND_URL", "")


def _resolve_sa_email(schedule: dict) -> str:
    """Return the service account email for OIDC, falling back to ADC on Cloud Run."""
    email = schedule.get("created_by", "")
    if email:
        return email
    if APP_MODE == "backend":
        try:
            import google.auth
            creds, _ = google.auth.default()
            return getattr(creds, "service_account_email", "") or ""
        except Exception:
            pass
    return ""


async def create_scheduler_job(schedule: dict) -> str:
    """Create a Cloud Scheduler job for the given schedule. Returns the full job name."""
    loop = asyncio.get_event_loop()

    project_id = schedule.get("project_id") or cfg.settings.active_project_id
    region = cfg.settings.cloud_run_region or os.environ.get("CLOUD_RUN_REGION", "europe-west1")
    backend_url = _resolve_backend_url()
    sa_email = _resolve_sa_email(schedule)

    if not backend_url:
        raise ValueError("Remote backend URL is not configured. Set BACKEND_URL env var on Cloud Run.")
    if not sa_email:
        raise ValueError("Cannot determine service account email for OIDC token.")

    job_body = _build_job_body(
        schedule_id=schedule["id"],
        project_id=project_id,
        region=region,
        backend_url=backend_url,
        sa_email=sa_email,
        cron_expression=schedule["cron_expression"],
        timezone=schedule.get("timezone", "UTC"),
        enabled=schedule.get("enabled", True),
    )

    def _run() -> str:
        client = _get_client()
        parent = _location_path(project_id, region)
        job = client.create_job(parent=parent, job=job_body)
        return job.name

    return await loop.run_in_executor(None, _run)


async def update_scheduler_job(schedule: dict) -> None:
    """Update an existing Cloud Scheduler job to match the schedule."""
    loop = asyncio.get_event_loop()

    project_id = schedule.get("project_id") or cfg.settings.active_project_id
    region = cfg.settings.cloud_run_region or os.environ.get("CLOUD_RUN_REGION", "europe-west1")
    backend_url = _resolve_backend_url()
    sa_email = _resolve_sa_email(schedule)

    if not backend_url:
        return  # Cannot update without the URL

    job_body = _build_job_body(
        schedule_id=schedule["id"],
        project_id=project_id,
        region=region,
        backend_url=backend_url,
        sa_email=sa_email,
        cron_expression=schedule["cron_expression"],
        timezone=schedule.get("timezone", "UTC"),
        enabled=schedule.get("enabled", True),
    )

    def _run() -> None:
        client = _get_client()
        from google.protobuf import field_mask_pb2
        update_mask = field_mask_pb2.FieldMask(
            paths=["schedule", "time_zone", "http_target", "state"]
        )
        client.update_job(job=job_body, update_mask=update_mask)

    await loop.run_in_executor(None, _run)


async def delete_scheduler_job(job_name: str) -> None:
    """Delete a Cloud Scheduler job by its full resource name."""
    if not job_name:
        return
    loop = asyncio.get_event_loop()

    def _run() -> None:
        client = _get_client()
        try:
            client.delete_job(name=job_name)
        except Exception:
            pass  # Already deleted or never existed

    await loop.run_in_executor(None, _run)


async def pause_scheduler_job(job_name: str) -> None:
    """Pause (disable) a Cloud Scheduler job."""
    if not job_name:
        return
    loop = asyncio.get_event_loop()

    def _run() -> None:
        client = _get_client()
        client.pause_job(name=job_name)

    await loop.run_in_executor(None, _run)


async def resume_scheduler_job(job_name: str) -> None:
    """Resume (enable) a Cloud Scheduler job."""
    if not job_name:
        return
    loop = asyncio.get_event_loop()

    def _run() -> None:
        client = _get_client()
        client.resume_job(name=job_name)

    await loop.run_in_executor(None, _run)
