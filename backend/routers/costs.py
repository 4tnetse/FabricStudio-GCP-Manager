from fastapi import APIRouter, HTTPException, Query
from google.auth.transport.requests import AuthorizedSession

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

    # Fetch SKUs using authenticated session
    try:
        s = AuthorizedSession(get_credentials())
        r = s.get(
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

    return {
        "billing_enabled": True,
        "billing_account_id": billing_account_id,
        "billing_account_name": billing_account_name,
        "display_name": display_name,
    }


@router.get("/billing-debug")
async def billing_debug():
    """Step-by-step test of every available billing API endpoint."""
    creds = get_credentials()
    s = AuthorizedSession(creds)
    project_id = cfg.settings.active_project_id
    results = {}

    # Step 1: billing info for the project
    try:
        r = s.get(f"https://cloudbilling.googleapis.com/v1/projects/{project_id}/billingInfo")
        results["step1_project_billing_info"] = {"status": r.status_code, "body": r.json()}
    except Exception as e:
        results["step1_project_billing_info"] = {"error": str(e)}

    # Extract billing account id for subsequent steps
    billing_account_id = None
    try:
        name = results["step1_project_billing_info"]["body"].get("billingAccountName", "")
        billing_account_id = name.split("/")[-1] if "/" in name else None
    except Exception:
        pass

    if not billing_account_id:
        results["note"] = "Could not extract billing account ID — stopping here"
        return results

    # Step 2: billing account details
    try:
        r = s.get(f"https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account_id}")
        results["step2_billing_account"] = {"status": r.status_code, "body": r.json()}
    except Exception as e:
        results["step2_billing_account"] = {"error": str(e)}

    # Step 3: projects linked to billing account
    try:
        r = s.get(f"https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account_id}/projects")
        results["step3_billing_account_projects"] = {"status": r.status_code, "body": r.json()}
    except Exception as e:
        results["step3_billing_account_projects"] = {"error": str(e)}

    # Step 4: budgets API
    try:
        r = s.get(f"https://billingbudgets.googleapis.com/v1/billingAccounts/{billing_account_id}/budgets")
        results["step4_budgets"] = {"status": r.status_code, "body": r.json()}
    except Exception as e:
        results["step4_budgets"] = {"error": str(e)}

    # Step 5: v1beta reports endpoint
    try:
        r = s.get(f"https://cloudbilling.googleapis.com/v1beta/billingAccounts/{billing_account_id}/reports",
                  params={"pageSize": 1})
        results["step5_v1beta_reports"] = {"status": r.status_code, "body": r.json()}
    except Exception as e:
        results["step5_v1beta_reports"] = {"error": str(e)}

    # Step 6: SKU catalog (unauthenticated test)
    try:
        import httpx
        r = httpx.get(
            "https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus",
            params={"pageSize": 1},
            timeout=10,
        )
        results["step6_sku_catalog_unauth"] = {"status": r.status_code}
    except Exception as e:
        results["step6_sku_catalog_unauth"] = {"error": str(e)}

    # Step 7: SKU catalog authenticated
    try:
        r = s.get(
            "https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus",
            params={"pageSize": 1},
        )
        results["step7_sku_catalog_auth"] = {"status": r.status_code}
    except Exception as e:
        results["step7_sku_catalog_auth"] = {"error": str(e)}

    # Step 8: fetch all SKUs (paginated) and look for E2 on-demand in europe-west1
    try:
        all_skus, token = [], None
        while True:
            params = {"pageSize": 5000, "currencyCode": "USD"}
            if token:
                params["pageToken"] = token
            r = s.get("https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus", params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            all_skus.extend(data.get("skus", []))
            token = data.get("nextPageToken")
            if not token:
                break

        results["step8_sku_fetch"] = {"total_skus": len(all_skus)}

        # Find E2 SKUs in europe-west1
        e2_matches = []
        for sku in all_skus:
            cat = sku.get("category", {})
            desc = sku.get("description", "")
            regions = sku.get("serviceRegions", [])
            if "europe-west1" in regions and "e2" in desc.lower():
                e2_matches.append({
                    "description": desc,
                    "resourceGroup": cat.get("resourceGroup"),
                    "usageType": cat.get("usageType"),
                    "resourceFamily": cat.get("resourceFamily"),
                })
        results["step8_e2_europe_west1_skus"] = e2_matches[:20]

    except Exception as e:
        results["step8_sku_fetch"] = {"error": str(e)}

    return results
