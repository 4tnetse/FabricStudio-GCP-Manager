import uuid
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config as cfg
from services.parallel_runner import job_manager
from services.ssh_runner import run_ssh_commands


def _load_commands_from_config(config_name: str) -> list[str]:
    safe = Path(config_name).name
    if not safe.endswith(".conf"):
        safe += ".conf"
    path = cfg.CONF_DIR / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Config file '{safe}' not found")
    commands = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            commands.append(stripped)
    return commands

router = APIRouter(prefix="/ssh", tags=["ssh"])


class SshExecuteRequest(BaseModel):
    addresses: list[str]
    commands: list[str] = []
    config_name: str | None = None
    parallel: bool = True


class SshTestRequest(BaseModel):
    addresses: list[str]


def _resolve_private_key_path() -> str | None:
    """Derive private key path from the ssh_public_key setting (which may be a file path)."""
    pub_key = (cfg.get_project_config(cfg.settings, cfg.settings.active_project_id).get("ssh_public_key") or "").strip()
    if not pub_key:
        return None
    # Only treat it as a file path if it starts with / or ~
    if pub_key.startswith("/") or pub_key.startswith("~"):
        candidate = Path(pub_key[:-4] if pub_key.endswith(".pub") else pub_key).expanduser()
        if candidate.exists():
            return str(candidate)
    return None


async def _ssh_job(
    job_id: str,
    addresses: list[str],
    commands: list[str],
    parallel: bool,
) -> None:
    q = job_manager.jobs[job_id]
    failed = False

    try:
        ssh_key_path = _resolve_private_key_path()

        await q.put(
            f"Running {len(commands)} command(s) on {len(addresses)} host(s) "
            f"({'parallel' if parallel else 'sequential'})"
        )

        await run_ssh_commands(
            addresses=addresses,
            commands=commands,
            parallel=parallel,
            ssh_key_path=ssh_key_path,
            log_queue=q,
        )

        await q.put(f"SSH execution completed for {len(addresses)} host(s)")

    except Exception as exc:
        await q.put(f"SSH job failed: {exc}")
        failed = True

    await job_manager.mark_done(job_id, failed=failed)


@router.post("/execute")
async def execute_ssh(body: SshExecuteRequest, background_tasks: BackgroundTasks):
    if not body.addresses:
        raise HTTPException(status_code=400, detail="No addresses provided")

    if body.config_name:
        commands = _load_commands_from_config(body.config_name)
    else:
        commands = body.commands

    if not commands:
        raise HTTPException(status_code=400, detail="No commands provided")

    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(
        _ssh_job, job_id, body.addresses, commands, body.parallel
    )
    return {"job_id": job_id}


async def _test_job(job_id: str, addresses: list[str]) -> None:
    q = job_manager.jobs[job_id]
    failed = False
    try:
        ssh_key_path = _resolve_private_key_path()
        await run_ssh_commands(
            addresses=addresses,
            commands=[],
            parallel=True,
            ssh_key_path=ssh_key_path,
            log_queue=q,
        )
    except Exception as exc:
        await q.put(f"Test failed: {exc}")
        failed = True
    await job_manager.mark_done(job_id, failed=failed)


@router.post("/test")
async def test_ssh_connection(body: SshTestRequest, background_tasks: BackgroundTasks):
    """Test SSH connectivity — streams banner to the log output."""
    if not body.addresses:
        raise HTTPException(status_code=400, detail="No addresses provided")
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_test_job, job_id, body.addresses)
    return {"job_id": job_id}


@router.get("/{job_id}/stream")
async def stream_ssh_job(job_id: str):
    if job_id not in job_manager.jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        async for chunk in job_manager.stream_job(job_id):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
