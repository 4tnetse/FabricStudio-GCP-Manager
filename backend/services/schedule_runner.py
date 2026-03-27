"""
schedule_runner — executes a triggered schedule job and persists logs to Firestore.

Called by POST /api/schedules/{id}/trigger (from Cloud Scheduler or manually).

Flow:
  1. Override cfg.settings with project_id + settings_snapshot from the schedule
  2. Build the appropriate request object from the schedule payload
  3. Create a job in job_manager (reuses existing SSE infrastructure)
  4. Launch the job as an asyncio task with a safety wrapper
  5. Drain the queue, accumulate log lines
  6. Write final log lines + status to Firestore job_run document
"""
import asyncio
import uuid
from datetime import datetime, timezone

import config as cfg
from models.instance import BulkConfigureRequest, CloneRequest
from services import firestore_client as fs
from services.parallel_runner import job_manager


async def run_triggered_job(schedule: dict, run_id: str) -> None:
    """Execute a schedule and write results to the Firestore job_run document."""

    job_id = str(uuid.uuid4())
    q = job_manager.create_job(job_id)

    # ------------------------------------------------------------------
    # Override global settings with schedule's project + snapshot
    # ------------------------------------------------------------------
    original_settings = cfg.settings
    snapshot = schedule.get("settings_snapshot", {})
    cfg.settings = cfg.settings.model_copy(update={
        "active_project_id": schedule.get("project_id") or cfg.settings.active_project_id,
        "active_key_id": schedule.get("key_id") or cfg.settings.active_key_id,
        "dns_domain": snapshot.get("dns_domain") or cfg.settings.dns_domain,
        "instance_fqdn_prefix": snapshot.get("instance_fqdn_prefix") or cfg.settings.instance_fqdn_prefix,
        "dns_zone_name": snapshot.get("dns_zone_name") or cfg.settings.dns_zone_name,
        "fs_admin_password": snapshot.get("fs_admin_password") or cfg.settings.fs_admin_password,
        "default_zone": snapshot.get("default_zone") or cfg.settings.default_zone,
        "owner": snapshot.get("owner") or cfg.settings.owner,
    })

    log_lines: list[str] = []
    failed = False

    try:
        job_type = schedule.get("job_type")
        payload = schedule.get("payload", {})

        # Build the request and start the job task
        if job_type == "clone":
            try:
                req = CloneRequest(**payload)
            except Exception as exc:
                await q.put(f"ERROR: invalid clone payload: {exc}")
                await job_manager.mark_done(job_id, failed=True)
            else:
                from routers.operations import _clone_job
                asyncio.create_task(_safe_job(_clone_job(job_id, req), job_id))

        elif job_type == "configure":
            try:
                req = BulkConfigureRequest(**payload)
            except Exception as exc:
                await q.put(f"ERROR: invalid configure payload: {exc}")
                await job_manager.mark_done(job_id, failed=True)
            else:
                from routers.operations import _bulk_configure_job
                asyncio.create_task(_safe_job(_bulk_configure_job(job_id, req), job_id))

        else:
            await q.put(f"ERROR: unknown job_type '{job_type}'")
            await job_manager.mark_done(job_id, failed=True)

        # Drain queue until sentinel
        while True:
            try:
                line = await asyncio.wait_for(q.get(), timeout=3600.0)
            except asyncio.TimeoutError:
                log_lines.append("ERROR: Job timed out after 1 hour")
                failed = True
                break

            if line == "__FAILED__":
                failed = True
                break
            if line == "__DONE__":
                break
            log_lines.append(line)

            # Flush to Firestore every 50 lines to give live visibility
            if len(log_lines) % 50 == 0:
                try:
                    await fs.append_log_lines(run_id, log_lines[-50:])
                except Exception:
                    pass  # best-effort

    except Exception as exc:
        log_lines.append(f"ERROR: {exc}")
        failed = True

    finally:
        cfg.settings = original_settings

    # Final Firestore write
    try:
        await fs.append_log_lines(run_id, log_lines)
        error_summary = next(
            (l for l in reversed(log_lines) if l.startswith("ERROR")), None
        )
        await fs.mark_run_status(
            run_id,
            status="failed" if failed else "completed",
            error_summary=error_summary,
        )
    except Exception:
        pass  # If Firestore is unavailable, there is not much we can do


async def _safe_job(coro, job_id: str) -> None:
    """Wrap a job coroutine so unexpected exceptions always trigger mark_done."""
    try:
        await coro
    except Exception as exc:
        q = job_manager.jobs.get(job_id)
        if q:
            await q.put(f"ERROR: unexpected failure: {exc}")
        await job_manager.mark_done(job_id, failed=True)
