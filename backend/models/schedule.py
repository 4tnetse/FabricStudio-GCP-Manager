from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Clone payload
# ---------------------------------------------------------------------------

class ClonePayload(BaseModel):
    source_name: str
    zone: str
    target_zone: str | None = None
    clone_base_name: str | None = None
    purpose: str | None = None
    count_start: int = 1
    count_end: int = 1
    overwrite: bool = False


# ---------------------------------------------------------------------------
# Configure payload
# ---------------------------------------------------------------------------

class ConfigurePayload(BaseModel):
    instances: list[dict] = []          # [{zone, name}]
    old_admin_password: str = ""
    admin_password: str = ""
    guest_password: str = ""
    trial_key: str = ""
    license_server: str = ""
    hostname_template: str = ""
    ssh_keys: list[str] = []
    delete_existing_keys: bool = False
    delete_all_workspaces: bool = False
    workspace_fabrics: list[dict] = []  # [{name, template_id, install}]


# ---------------------------------------------------------------------------
# Settings snapshot stored alongside the schedule
# ---------------------------------------------------------------------------

class SettingsSnapshot(BaseModel):
    dns_domain: str = ""
    instance_fqdn_prefix: str = ""
    dns_zone_name: str = ""
    fs_admin_password: str = ""
    default_zone: str = ""
    owner: str = ""


# ---------------------------------------------------------------------------
# Core schedule model (as stored in Firestore)
# ---------------------------------------------------------------------------

class Schedule(BaseModel):
    id: str
    name: str
    job_type: str                       # "clone" | "configure"
    cron_expression: str
    timezone: str = "Europe/Brussels"
    enabled: bool = True
    project_id: str
    key_id: str
    payload: dict[str, Any] = {}
    settings_snapshot: dict[str, Any] = {}
    cloud_scheduler_job_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: str = ""


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    name: str
    job_type: str                       # "clone" | "configure"
    cron_expression: str
    timezone: str = "Europe/Brussels"
    enabled: bool = True
    payload: dict[str, Any] = {}
    project_id: str | None = None       # injected by frontend; used by Cloud Run backend


class ScheduleUpdate(BaseModel):
    name: str | None = None
    cron_expression: str | None = None
    timezone: str | None = None
    enabled: bool | None = None
    payload: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Job run model (as stored in Firestore)
# ---------------------------------------------------------------------------

class JobRun(BaseModel):
    id: str
    schedule_id: str
    schedule_name: str
    job_type: str
    triggered_by: str                   # "scheduler" | "manual"
    status: str                         # "running" | "completed" | "failed"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    log_lines: list[str] = []
    error_summary: str | None = None
    project_id: str = ""
