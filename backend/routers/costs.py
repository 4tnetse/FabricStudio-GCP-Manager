from datetime import date

from fastapi import APIRouter, HTTPException, Query

import config as cfg
from auth import get_credentials
from services.gcp_billing import GCPBillingService
from services.gcp_compute import GCPComputeService

router = APIRouter(prefix="/costs", tags=["costs"])


def _get_billing_service() -> GCPBillingService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    return GCPBillingService(get_credentials(), cfg.settings.active_project_id)


def _get_compute_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    return GCPComputeService(get_credentials(), cfg.settings.active_project_id)


@router.get("/machine-type-debug")
async def debug_machine_type_price(
    machine_type: str = Query(...),
    zone: str = Query(...),
):
    """Debug endpoint: returns matching SKUs for a machine type/zone."""
    from services.gcp_billing import _get_sku_desc_prefix, _sku_cache, _SKU_TTL, _COMPUTE_ENGINE_SERVICE_ID
    import time
    billing = _get_billing_service()
    compute = _get_compute_service()

    specs = None
    try:
        specs = await compute.get_machine_type_specs(zone, machine_type)
    except Exception as e:
        return {"error": f"specs failed: {e}"}

    region = "-".join(zone.split("-")[:-1])
    prefix = _get_sku_desc_prefix(machine_type)

    # Fetch SKUs directly (public API, no auth needed)
    import httpx as _httpx
    try:
        r = _httpx.get(
            f"https://cloudbilling.googleapis.com/v1/services/{_COMPUTE_ENGINE_SERVICE_ID}/skus",
            params={"pageSize": 50, "currencyCode": "USD"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        skus = data.get("skus", [])
        first_descs = [sk.get("description") for sk in skus[:20]]
    except Exception as e:
        return {"error": f"sku fetch failed: {e}"}

    prefix_lower = (prefix or "").lower()

    prefix_lower = (prefix or "").lower()
    matching = []
    for sku in skus:
        cat = sku.get("category", {})
        desc = sku.get("description", "")
        if region in sku.get("serviceRegions", []):
            if cat.get("resourceGroup") in ("CPU", "RAM") and cat.get("usageType") == "OnDemand":
                if desc.lower().startswith(prefix_lower[:3]):  # just first 3 chars (e.g. "n1 ", "e2 ")
                    matching.append({"description": desc, "resourceGroup": cat.get("resourceGroup"), "usageType": cat.get("usageType")})

    return {
        "machine_type": machine_type,
        "zone": zone,
        "region": region,
        "specs": specs,
        "sku_prefix": prefix,
        "first_10_descriptions": first_descs,
        "matching_skus": matching[:20],
    }


@router.get("/machine-type-price")
async def get_machine_type_price(
    machine_type: str = Query(...),
    zone: str = Query(...),
):
    compute = _get_compute_service()
    billing = _get_billing_service()
    try:
        specs = await compute.get_machine_type_specs(zone, machine_type)
    except Exception:
        return {"price_usd": None}
    try:
        price = await billing.get_hourly_price(
            machine_type, zone, specs["vcpus"], specs["memory_gib"]
        )
    except Exception:
        return {"price_usd": None, "source": None}
    if not price:
        return {"price_usd": None, "source": None}
    return {
        "price_usd": price["price_usd"],
        "source": price["source"],
        "vcpus": specs["vcpus"],
        "memory_gib": specs["memory_gib"],
    }


@router.get("/summary")
async def get_cost_summary():
    svc = _get_billing_service()

    # Step 1: get billing account linked to the project
    try:
        billing_info = await svc.get_project_billing_info()
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 403:
            return {"billing_enabled": None, "costs_error": "permission_denied"}
        raise HTTPException(status_code=500, detail=f"Failed to get billing info: {exc}")

    if not billing_info.get("billingEnabled"):
        return {"billing_enabled": False}

    billing_account_name = billing_info.get("billingAccountName", "")
    billing_account_id = billing_account_name.split("/")[-1] if "/" in billing_account_name else billing_account_name

    # Step 2: get display name
    display_name = billing_account_id
    try:
        display_name = await svc.get_billing_account_display_name(billing_account_id)
    except Exception:
        pass

    # Step 3: get cost data for current month
    today = date.today()
    start = date(today.year, today.month, 1)

    costs_data = None
    costs_error = None
    try:
        costs_data = await svc.get_costs(billing_account_id, start, today)
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 403:
            costs_error = "permission_denied"
        else:
            costs_error = str(exc)

    return {
        "billing_enabled": True,
        "billing_account_id": billing_account_id,
        "billing_account_name": billing_account_name,
        "display_name": display_name,
        "start_date": start.isoformat(),
        "end_date": today.isoformat(),
        "costs": costs_data,
        "costs_error": costs_error,
    }
