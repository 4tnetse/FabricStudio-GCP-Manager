"""Shared helpers for instance DNS record management."""
import asyncio

import config as cfg
from auth import get_credentials
from services.gcp_compute import GCPComputeService
from services.gcp_dns import GCPDnsService
from services.instance_naming import InstanceName


def _dns_settings() -> tuple[str, str, str] | None:
    """Return (zone_name, fqdn_prefix, dns_domain) if all DNS settings are configured, else None."""
    zone = cfg.settings.dns_zone_name
    prefix = cfg.settings.instance_fqdn_prefix
    domain = cfg.settings.dns_domain
    if zone and prefix and domain:
        return zone, prefix, domain
    return None


def _build_fqdn(instance_name: str, prefix: str, domain: str) -> str | None:
    """Build FQDN from instance name. Returns None if name can't be parsed."""
    try:
        parsed = InstanceName.parse(instance_name)
        return f"{prefix}{parsed.number}.{domain}"
    except ValueError:
        return None


async def delete_dns_for_instance(instance_name: str, log=None) -> None:
    """Delete the A record for an instance. Silently skips if DNS not configured."""
    settings = _dns_settings()
    if not settings:
        return
    zone_name, prefix, domain = settings
    fqdn = _build_fqdn(instance_name, prefix, domain)
    if not fqdn:
        return
    try:
        dns_svc = GCPDnsService(get_credentials(), cfg.settings.active_project_id)
        await dns_svc.delete_a_record(zone_name=zone_name, fqdn=fqdn)
        if log:
            await log(f"DNS record deleted: {fqdn}")
    except Exception as exc:
        if log:
            await log(f"WARNING: failed to delete DNS record {fqdn}: {exc}")


async def create_dns_for_instance(
    instance_name: str,
    zone: str,
    log=None,
    poll_interval: float = 5.0,
    max_attempts: int = 20,
) -> None:
    """Wait for a public IP then create/replace the A record for an instance."""
    settings = _dns_settings()
    if not settings:
        return
    zone_name, prefix, domain = settings
    fqdn = _build_fqdn(instance_name, prefix, domain)
    if not fqdn:
        return
    try:
        svc = GCPComputeService(get_credentials(), cfg.settings.active_project_id)
        public_ip = None
        for attempt in range(max_attempts):
            inst = await svc.get_instance(zone=zone, name=instance_name)
            if inst.public_ip:
                public_ip = inst.public_ip
                break
            if attempt == 0 and log:
                await log(f"Waiting for public IP on {instance_name}…")
            await asyncio.sleep(poll_interval)

        if public_ip:
            dns_svc = GCPDnsService(get_credentials(), cfg.settings.active_project_id)
            await dns_svc.upsert_a_record(zone_name=zone_name, fqdn=fqdn, public_ip=public_ip)
            if log:
                await log(f"DNS record created: {fqdn} → {public_ip}")
        else:
            if log:
                await log(f"WARNING: no public IP on {instance_name} after {int(max_attempts * poll_interval)}s — DNS skipped")
    except Exception as exc:
        if log:
            await log(f"WARNING: failed to create DNS record for {instance_name}: {exc}")
