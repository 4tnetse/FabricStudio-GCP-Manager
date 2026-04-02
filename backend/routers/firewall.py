import asyncio

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from models.firewall import IpAclRequest
from models.instance import GlobalAccessRequest
from services.gcp_compute import GCPComputeService

router = APIRouter(prefix="/firewall", tags=["firewall"])

ACL_RULE_NAME = "workshop-source-networks"
GLOBAL_RULE_NAME = "workshop-source-any"

# Lock to prevent concurrent firewall modifications
_firewall_lock = asyncio.Lock()


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


def _active_network() -> str:
    project_id = cfg.settings.active_project_id or ""
    return cfg.get_project_config(cfg.settings, project_id).get("default_network") or "default"


async def _detect_caller_ip() -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.ipify.org", timeout=10.0)
        resp.raise_for_status()
        return resp.text.strip()


_ACL_TCP_PORTS = ["22", "80", "443", "8000", "8080", "8888", "10000-20000", "20808", "20909", "22222"]
_ACL_UDP_PORTS = ["53", "514", "1812", "1813"]


@router.get("/acl")
async def get_acl():
    svc = _get_service()
    try:
        rule = await svc.get_firewall_rule(ACL_RULE_NAME)
        return {"ips": rule.source_ranges}
    except Exception:
        return {"ips": []}


@router.post("/acl/add")
async def add_acl_entry(body: IpAclRequest):
    if body.ip_address is None:
        ip = await _detect_caller_ip()
    else:
        ip = body.ip_address

    # Ensure CIDR notation
    if "/" not in ip:
        ip = f"{ip}/32"

    svc = _get_service()
    async with _firewall_lock:
        try:
            rule = await svc.get_firewall_rule(ACL_RULE_NAME)
            # Rule exists — add IP to source ranges
            current = list(rule.source_ranges)
            if ip not in current:
                current.append(ip)
                await svc.update_firewall_source_ranges(ACL_RULE_NAME, current)
        except Exception:
            # Rule doesn't exist — create it with this first IP
            try:
                global_rule = await svc.get_firewall_rule(GLOBAL_RULE_NAME)
                priority = global_rule.priority + 1
            except Exception:
                priority = 1001
            await svc.create_firewall_rule(
                name=ACL_RULE_NAME,
                network=_active_network(),
                priority=priority,
                allowed_tcp=_ACL_TCP_PORTS,
                allowed_udp=_ACL_UDP_PORTS,
                source_ranges=[ip],
                target_tags=[ACL_RULE_NAME],
            )
            current = [ip]

    return {"detail": f"IP {ip} added to ACL", "source_ranges": current}


@router.delete("/acl/remove")
async def remove_acl_entry(body: dict):
    ip_address = body.get("ip_address")
    if not ip_address:
        raise HTTPException(status_code=400, detail="ip_address is required")

    if "/" not in ip_address:
        ip_address = f"{ip_address}/32"

    svc = _get_service()
    async with _firewall_lock:
        try:
            rule = await svc.get_firewall_rule(ACL_RULE_NAME)
        except Exception:
            return {"detail": f"IP {ip_address} not found", "source_ranges": []}

        current = [r for r in rule.source_ranges if r != ip_address]
        if not current:
            # Last IP removed — delete the rule
            await svc.delete_firewall_rule(ACL_RULE_NAME)
        else:
            await svc.update_firewall_source_ranges(ACL_RULE_NAME, current)

    return {"detail": f"IP {ip_address} removed from ACL", "source_ranges": current}


@router.get("/global-access")
async def get_global_access():
    svc = _get_service()
    try:
        await svc.get_firewall_rule(GLOBAL_RULE_NAME)
        enabled = True
    except Exception:
        enabled = False
    return {"enabled": enabled}


@router.post("/global-access")
async def set_global_access(body: GlobalAccessRequest):
    svc = _get_service()
    async with _firewall_lock:
        if body.enabled:
            # Always delete first to ensure rule matches spec exactly
            try:
                await svc.delete_firewall_rule(GLOBAL_RULE_NAME)
            except Exception:
                pass

            # Priority: one lower number than workshop-source-networks (lower number = higher priority)
            try:
                networks_rule = await svc.get_firewall_rule(ACL_RULE_NAME)
                priority = networks_rule.priority - 1
            except Exception:
                priority = 1000

            try:
                await svc.create_firewall_rule(
                    name=GLOBAL_RULE_NAME,
                    network=_active_network(),
                    priority=priority,
                    allowed_tcp=["22", "80", "443", "8000", "8080", "8888", "10000-20000", "20808", "20909", "22222"],
                    allowed_udp=["53", "514", "1812", "1813"],
                    source_ranges=["0.0.0.0/0"],
                    target_tags=[GLOBAL_RULE_NAME],
                )
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to create firewall rule: {exc}")
        else:
            try:
                await svc.delete_firewall_rule(GLOBAL_RULE_NAME)
            except Exception:
                pass

    return {"detail": f"Global access {'enabled' if body.enabled else 'disabled'}", "enabled": body.enabled}


@router.get("/rules")
async def list_firewall_rules():
    svc = _get_service()
    network = _active_network()
    try:
        rules = await svc.list_firewall_rules()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list firewall rules: {exc}")
    filtered = [r for r in rules if r.network == network]
    return [r.model_dump() for r in sorted(filtered, key=lambda r: r.priority)]
