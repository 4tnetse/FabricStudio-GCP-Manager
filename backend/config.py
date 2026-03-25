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


class AppSettings(BaseModel):
    service_account_key_path: str | None = None
    service_account_key_name: str | None = None
    active_project_id: str | None = None
    active_key_id: str | None = None
    initials: str = ""
    default_zone: str = "europe-west4-a"
    default_type: str = "fs"
    owner: str = ""
    group: str = ""
    ssh_public_key: str = ""
    license_server: str = ""
    dns_domain: str = ""
    instance_fqdn_prefix: str = ""
    dns_zone_name: str = ""
    fs_admin_password: str = ""

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
