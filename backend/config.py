import json
import os
import re
from pathlib import Path
from pydantic import BaseModel, field_validator

_DNS_LABEL = r'[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?'
_DNS_DOMAIN_RE = re.compile(rf'^{_DNS_LABEL}(\.{_DNS_LABEL})*$')
_DNS_PREFIX_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?$')


SETTINGS_DIR = Path.home() / ".fabricstudio"
SETTINGS_FILE = SETTINGS_DIR / "settings.json"
CONF_DIR = Path(__file__).parent.parent / "conf"


# Fields that are stored per-project (preferences + scheduling).
# Everything else (key management, active_project_id) stays global.
_PER_PROJECT_FIELDS = {
    # Preferences
    "initials", "default_zone", "default_type", "owner", "group",
    "ssh_public_key", "dns_domain", "instance_fqdn_prefix", "dns_zone_name",
    "fs_admin_password",
    # Scheduling
    "remote_scheduling_enabled", "remote_backend_url", "cloud_run_region",
    "firestore_project_id",
}

# Subset used by scheduling proxy / Cloud Run logic
_SCHEDULING_FIELDS = {
    "remote_scheduling_enabled", "remote_backend_url", "cloud_run_region",
    "firestore_project_id",
}

_PROJECT_DEFAULTS: dict = {
    "initials": "",
    "default_zone": "europe-west4-a",
    "default_type": "fs",
    "owner": "",
    "group": "",
    "ssh_public_key": "",
    "dns_domain": "",
    "instance_fqdn_prefix": "",
    "dns_zone_name": "",
    "fs_admin_password": "",
    "remote_scheduling_enabled": False,
    "remote_backend_url": "",
    "cloud_run_region": "europe-west1",
    "firestore_project_id": "",
}


class AppSettings(BaseModel):
    service_account_key_path: str | None = None
    service_account_key_name: str | None = None
    active_project_id: str | None = None
    active_key_id: str | None = None
    # Legacy top-level fields — kept for backward-compat loading only.
    # New writes go to project_configs[project_id].
    initials: str = ""
    default_zone: str = "europe-west4-a"
    default_type: str = "fs"
    owner: str = ""
    group: str = ""
    ssh_public_key: str = ""
    dns_domain: str = ""
    instance_fqdn_prefix: str = ""
    dns_zone_name: str = ""
    fs_admin_password: str = ""
    remote_scheduling_enabled: bool = False
    remote_backend_url: str = ""
    cloud_run_region: str = "europe-west1"
    firestore_project_id: str = ""
    # Per-project config (project_id -> dict of _PER_PROJECT_FIELDS)
    project_configs: dict[str, dict] = {}
    # Legacy alias — old settings files may have this key
    scheduling_configs: dict[str, dict] = {}

    @field_validator("dns_domain")
    @classmethod
    def validate_dns_domain(cls, v: str) -> str:
        if v and not _DNS_DOMAIN_RE.match(v):
            raise ValueError("Invalid DNS domain (e.g. fs.fortilab.be)")
        return v

    @field_validator("instance_fqdn_prefix")
    @classmethod
    def validate_fqdn_prefix(cls, v: str) -> str:
        if v and not _DNS_PREFIX_RE.match(v):
            raise ValueError("Invalid FQDN prefix — use letters, numbers and hyphens only (e.g. lab)")
        return v


def get_project_config(s: "AppSettings", project_id: str | None) -> dict:
    """Return per-project settings, falling back to legacy top-level values."""
    base = dict(_PROJECT_DEFAULTS)
    # Overlay legacy top-level values (backward compat for existing settings files)
    for k in _PER_PROJECT_FIELDS:
        v = getattr(s, k, None)
        if v is not None and v != _PROJECT_DEFAULTS.get(k):
            base[k] = v
    # Overlay old scheduling_configs if present
    if project_id and project_id in s.scheduling_configs:
        base.update({k: v for k, v in s.scheduling_configs[project_id].items() if k in _PER_PROJECT_FIELDS})
    # Overlay project_configs (authoritative)
    if project_id and project_id in s.project_configs:
        base.update({k: v for k, v in s.project_configs[project_id].items() if k in _PER_PROJECT_FIELDS})
    return base


def get_project_scheduling(s: "AppSettings", project_id: str | None) -> dict:
    """Convenience: return only scheduling fields for the given project."""
    full = get_project_config(s, project_id)
    return {k: full[k] for k in _SCHEDULING_FIELDS}


def set_project_config(s: "AppSettings", project_id: str, patch: dict) -> "AppSettings":
    """Return a copy of s with per-project fields updated for the given project."""
    existing = dict(s.project_configs.get(project_id, {}))
    existing.update({k: v for k, v in patch.items() if k in _PER_PROJECT_FIELDS})
    new_configs = dict(s.project_configs)
    new_configs[project_id] = existing
    return s.model_copy(update={"project_configs": new_configs})


def set_project_scheduling(s: "AppSettings", project_id: str, patch: dict) -> "AppSettings":
    """Convenience: update only scheduling fields for the given project."""
    return set_project_config(s, project_id, {k: v for k, v in patch.items() if k in _SCHEDULING_FIELDS})


def load_settings() -> AppSettings:
    if not SETTINGS_FILE.exists():
        return AppSettings()
    try:
        data = json.loads(SETTINGS_FILE.read_text())
        return AppSettings(**data)
    except Exception:
        return AppSettings()


def save_settings(s: AppSettings) -> None:
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(s.model_dump_json(indent=2))


settings = load_settings()
