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


async def _detect_caller_ip() -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.ipify.org", timeout=10.0)
        resp.raise_for_status()
        return resp.text.strip()


@router.get("/acl")
async def get_acl():
    svc = _get_service()
    try:
        rule = await svc.get_firewall_rule(ACL_RULE_NAME)
    except Exception as exc:
        raise HTTPException(
            status_code=404, detail=f"Firewall rule '{ACL_RULE_NAME}' not found: {exc}"
        )
    return {"ips": rule.source_ranges}


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
        except Exception as exc:
            raise HTTPException(
                status_code=404,
                detail=f"Firewall rule '{ACL_RULE_NAME}' not found: {exc}",
            )
        current = list(rule.source_ranges)
        if ip not in current:
            current.append(ip)
            await svc.update_firewall_source_ranges(ACL_RULE_NAME, current)

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
        except Exception as exc:
            raise HTTPException(
                status_code=404,
                detail=f"Firewall rule '{ACL_RULE_NAME}' not found: {exc}",
            )
        current = [r for r in rule.source_ranges if r != ip_address]
        await svc.update_firewall_source_ranges(ACL_RULE_NAME, current)

    return {"detail": f"IP {ip_address} removed from ACL", "source_ranges": current}


@router.get("/global-access")
async def get_global_access():
    svc = _get_service()
    try:
        rule = await svc.get_firewall_rule(GLOBAL_RULE_NAME)
        # Rule active (not disabled) = global access enabled
        enabled = not rule.disabled
    except Exception:
        enabled = False
    return {"enabled": enabled}


@router.post("/global-access")
async def set_global_access(body: GlobalAccessRequest):
    svc = _get_service()
    async with _firewall_lock:
        try:
            await svc.set_firewall_disabled(GLOBAL_RULE_NAME, disabled=not body.enabled)
        except Exception as exc:
            raise HTTPException(
                status_code=404,
                detail=f"Firewall rule '{GLOBAL_RULE_NAME}' not found: {exc}",
            )
    return {"detail": f"Global access {'enabled' if body.enabled else 'disabled'}", "enabled": body.enabled}


@router.get("/rules")
async def list_firewall_rules():
    svc = _get_service()
    try:
        rules = await svc.list_firewall_rules()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list firewall rules: {exc}")
    return [r.model_dump() for r in rules]
