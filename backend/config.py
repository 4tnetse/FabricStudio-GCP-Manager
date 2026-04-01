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
    "fs_admin_password", "default_network",
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
    "default_network": "",
    "remote_scheduling_enabled": False,
    "remote_backend_url": "",
    "cloud_run_region": "",
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
    cloud_run_region: str = ""
    firestore_project_id: str = ""
    # Global notification settings
    teams_webhook_url: str = ""
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
    """Return per-project settings for the given project."""
    base = dict(_PROJECT_DEFAULTS)
    # Overlay old scheduling_configs if present (legacy)
    if project_id and project_id in s.scheduling_configs:
        base.update({k: v for k, v in s.scheduling_configs[project_id].items() if k in _PER_PROJECT_FIELDS})
    # Overlay project_configs (authoritative)
    if project_id and project_id in s.project_configs:
        base.update({k: v for k, v in s.project_configs[project_id].items() if k in _PER_PROJECT_FIELDS})
    return base


def migrate_legacy_preferences(s: "AppSettings") -> "AppSettings":
    """One-time migration: move top-level preference fields into project_configs and clear them."""
    legacy = {k: getattr(s, k) for k in _PER_PROJECT_FIELDS
              if getattr(s, k, None) not in (None, _PROJECT_DEFAULTS.get(k))}
    if not legacy:
        return s
    update: dict = {k: _PROJECT_DEFAULTS[k] for k in legacy}  # clear top-level fields
    if s.active_project_id:
        existing = dict(s.project_configs.get(s.active_project_id, {}))
        for k, v in legacy.items():
            if k not in existing:  # don't overwrite already-migrated values
                existing[k] = v
        new_configs = dict(s.project_configs)
        new_configs[s.active_project_id] = existing
        update["project_configs"] = new_configs
    return s.model_copy(update=update)


# Fields that had hardcoded defaults which should now be treated as "not set".
# NOTE: cloud_run_region was previously here but was removed — clearing it would
# silently wipe a legitimately configured "europe-west1" region on every restart.
_LEGACY_DEFAULTS: dict = {}


def migrate_legacy_defaults(s: "AppSettings") -> "AppSettings":
    """Clear fields that were previously hardcoded to a default value but should now be blank."""
    new_configs = {}
    changed = False
    for pid, cfg_dict in s.project_configs.items():
        cleaned = dict(cfg_dict)
        for field, old_default in _LEGACY_DEFAULTS.items():
            if cleaned.get(field) == old_default:
                del cleaned[field]
                changed = True
        new_configs[pid] = cleaned
    if not changed:
        return s
    return s.model_copy(update={"project_configs": new_configs})


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
