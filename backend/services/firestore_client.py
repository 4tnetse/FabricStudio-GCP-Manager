"""
Async-friendly Firestore wrapper for schedule and job-run persistence.

google-cloud-firestore is synchronous, so we run all blocking calls in
a thread pool executor to avoid blocking the event loop.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore
from google.oauth2 import service_account

import config as cfg

APP_MODE = os.environ.get("APP_MODE", "full")

FIRESTORE_DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "fabricstudio-gcp-manager")


def _get_client(project_id: str | None = None) -> firestore.Client:
    """Return an authenticated Firestore client.

    In Cloud Run (APP_MODE=backend) uses Application Default Credentials.
    Project is resolved from (in order): argument, firestore_project_id setting,
    ADC default project (Cloud Run metadata).
    In local mode loads the active service account key file.
    """
    # firestore_project_id is stored per-project in project_configs; fall back to active project
    sched = cfg.get_project_scheduling(cfg.settings, cfg.settings.active_project_id)
    firestore_project = sched.get("firestore_project_id") or ""

    if APP_MODE == "backend":
        import google.auth
        pid = project_id or firestore_project or cfg.settings.active_project_id
        if not pid:
            _, pid = google.auth.default()
        if not pid:
            raise RuntimeError("Cannot determine GCP project for Firestore.")
        return firestore.Client(project=pid, database=FIRESTORE_DATABASE_ID)

    pid = project_id or firestore_project or cfg.settings.active_project_id
    if not pid:
        raise RuntimeError("No active project configured.")
    key_id = cfg.settings.active_key_id
    if not key_id:
        raise RuntimeError("No active key configured.")
    from services.key_store import get_key_path
    key_path = get_key_path(key_id)
    creds = service_account.Credentials.from_service_account_file(str(key_path))
    return firestore.Client(project=pid, database=FIRESTORE_DATABASE_ID, credentials=creds)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Schedules collection
# ---------------------------------------------------------------------------

async def list_schedules(project_id: str | None = None) -> list[dict]:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        query = db.collection("schedules")
        if project_id:
            query = query.where("project_id", "==", project_id)
        docs = query.stream()
        return [_doc_to_dict(d) for d in docs]

    return await loop.run_in_executor(None, _run)


async def get_schedule(schedule_id: str) -> dict | None:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        doc = db.collection("schedules").document(schedule_id).get()
        return _doc_to_dict(doc) if doc.exists else None

    return await loop.run_in_executor(None, _run)


async def create_schedule(data: dict) -> dict:
    loop = asyncio.get_event_loop()
    schedule_id = str(uuid.uuid4())
    now = _now()

    def _run():
        db = _get_client()
        doc_data = {
            **data,
            "id": schedule_id,
            "created_at": now,
            "updated_at": now,
        }
        db.collection("schedules").document(schedule_id).set(doc_data)
        return doc_data

    return await loop.run_in_executor(None, _run)


async def update_schedule(schedule_id: str, updates: dict) -> dict | None:
    loop = asyncio.get_event_loop()
    now = _now()

    def _run():
        db = _get_client()
        ref = db.collection("schedules").document(schedule_id)
        doc = ref.get()
        if not doc.exists:
            return None
        merged = {**_doc_to_dict(doc), **updates, "updated_at": now}
        ref.set(merged)
        return merged

    return await loop.run_in_executor(None, _run)


async def delete_schedule(schedule_id: str) -> bool:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        ref = db.collection("schedules").document(schedule_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    return await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# Job runs collection
# ---------------------------------------------------------------------------

async def create_job_run(data: dict) -> dict:
    loop = asyncio.get_event_loop()
    run_id = str(uuid.uuid4())
    now = _now()

    def _run():
        db = _get_client()
        doc_data = {**data, "id": run_id, "started_at": now, "status": "running"}
        db.collection("job_runs").document(run_id).set(doc_data)
        return doc_data

    return await loop.run_in_executor(None, _run)


async def update_job_run(run_id: str, updates: dict) -> dict | None:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        ref = db.collection("job_runs").document(run_id)
        doc = ref.get()
        if not doc.exists:
            return None
        merged = {**_doc_to_dict(doc), **updates}
        ref.set(merged)
        return merged

    return await loop.run_in_executor(None, _run)


async def list_job_runs(schedule_id: str, limit: int = 50) -> list[dict]:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        # Avoid .order_by() here — combining .where() + .order_by() on different
        # fields requires a Firestore composite index that may not exist.
        # Sort descending in Python instead.
        docs = (
            db.collection("job_runs")
            .where("schedule_id", "==", schedule_id)
            .stream()
        )
        results = [_doc_to_dict(d) for d in docs]
        results.sort(
            key=lambda r: r.get("started_at") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return results[:limit]

    return await loop.run_in_executor(None, _run)


async def get_job_run(run_id: str) -> dict | None:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        doc = db.collection("job_runs").document(run_id).get()
        return _doc_to_dict(doc) if doc.exists else None

    return await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# Log writing helpers (used by schedule_runner during triggered job execution)
# ---------------------------------------------------------------------------

async def append_log_lines(run_id: str, lines: list[str]) -> None:
    """Append log lines to an existing job_run document."""
    if not lines:
        return
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        ref = db.collection("job_runs").document(run_id)
        doc = ref.get()
        if not doc.exists:
            return
        existing = (doc.to_dict() or {}).get("log_lines", [])
        # Cap at 1000 total lines
        combined = (existing + lines)[-1000:]
        ref.update({"log_lines": combined})

    await loop.run_in_executor(None, _run)


async def mark_run_status(
    run_id: str,
    status: str,
    error_summary: str | None = None,
) -> None:
    """Update status and finished_at on a job_run document."""
    loop = asyncio.get_event_loop()
    now = _now()

    def _run():
        db = _get_client()
        update: dict[str, Any] = {"status": status, "finished_at": now}
        if error_summary is not None:
            update["error_summary"] = error_summary
        db.collection("job_runs").document(run_id).update(update)

    await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# Workshops collection
# ---------------------------------------------------------------------------

async def list_workshops(project_id: str | None = None) -> list[dict]:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        query = db.collection("workshops")
        if project_id:
            query = query.where("project_id", "==", project_id)
        docs = query.stream()
        return [_doc_to_dict(d) for d in docs]

    return await loop.run_in_executor(None, _run)


async def get_workshop(workshop_id: str) -> dict | None:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        doc = db.collection("workshops").document(workshop_id).get()
        return _doc_to_dict(doc) if doc.exists else None

    return await loop.run_in_executor(None, _run)


async def create_workshop(data: dict) -> dict:
    loop = asyncio.get_event_loop()
    workshop_id = str(uuid.uuid4())
    now = _now()

    def _run():
        db = _get_client()
        doc_data = {
            **data,
            "id": workshop_id,
            "created_at": now,
            "updated_at": now,
        }
        db.collection("workshops").document(workshop_id).set(doc_data)
        return doc_data

    return await loop.run_in_executor(None, _run)


async def update_workshop(workshop_id: str, updates: dict) -> dict | None:
    loop = asyncio.get_event_loop()
    now = _now()

    def _run():
        db = _get_client()
        ref = db.collection("workshops").document(workshop_id)
        doc = ref.get()
        if not doc.exists:
            return None
        merged = {**_doc_to_dict(doc), **updates, "updated_at": now}
        ref.set(merged)
        return merged

    return await loop.run_in_executor(None, _run)


async def delete_workshop(workshop_id: str) -> bool:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        ref = db.collection("workshops").document(workshop_id)
        if not ref.get().exists:
            return False
        # Delete attendees subcollection first
        attendees = ref.collection("attendees").stream()
        for attendee_doc in attendees:
            attendee_doc.reference.delete()
        ref.delete()
        return True

    return await loop.run_in_executor(None, _run)


async def list_attendees(workshop_id: str) -> list[dict]:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        docs = db.collection("workshops").document(workshop_id).collection("attendees").stream()
        return [_doc_to_dict(d) for d in docs]

    return await loop.run_in_executor(None, _run)


async def create_attendee(workshop_id: str, data: dict) -> dict:
    loop = asyncio.get_event_loop()
    attendee_id = str(uuid.uuid4())
    now = _now()

    def _run():
        db = _get_client()
        doc_data = {
            **data,
            "id": attendee_id,
            "workshop_id": workshop_id,
            "registered_at": now,
        }
        db.collection("workshops").document(workshop_id).collection("attendees").document(attendee_id).set(doc_data)
        return doc_data

    return await loop.run_in_executor(None, _run)


async def delete_attendee(workshop_id: str, attendee_id: str) -> bool:
    loop = asyncio.get_event_loop()

    def _run():
        db = _get_client()
        ref = db.collection("workshops").document(workshop_id).collection("attendees").document(attendee_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    return await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _doc_to_dict(doc) -> dict[str, Any]:
    """Convert a Firestore document snapshot to a plain dict."""
    data = doc.to_dict() or {}
    # Convert Firestore DatetimeWithNanoseconds to regular datetime
    for k, v in data.items():
        if hasattr(v, "tzinfo") and not isinstance(v, datetime):
            data[k] = datetime.fromisoformat(str(v))
    return data
