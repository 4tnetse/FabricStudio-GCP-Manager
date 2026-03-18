from pydantic import BaseModel, field_validator
from config import _DNS_DOMAIN_RE, _DNS_PREFIX_RE


class SettingsUpdate(BaseModel):
    initials: str | None = None
    default_zone: str | None = None
    default_type: str | None = None
    owner: str | None = None
    group: str | None = None
    ssh_public_key: str | None = None
    license_server: str | None = None
    dns_domain: str | None = None
    instance_fqdn_prefix: str | None = None
    dns_zone_name: str | None = None
    active_project_id: str | None = None

    @field_validator("dns_domain")
    @classmethod
    def validate_dns_domain(cls, v: str | None) -> str | None:
        if v and not _DNS_DOMAIN_RE.match(v):
            raise ValueError("Invalid DNS domain (e.g. fs.fortilab.be)")
        return v

    @field_validator("instance_fqdn_prefix")
    @classmethod
    def validate_fqdn_prefix(cls, v: str | None) -> str | None:
        if v and not _DNS_PREFIX_RE.match(v):
            raise ValueError("Invalid FQDN prefix — use letters, numbers and hyphens only (e.g. lab)")
        return v
