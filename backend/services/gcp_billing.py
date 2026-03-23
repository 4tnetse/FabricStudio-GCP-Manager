import asyncio
import time
from datetime import date

import httpx
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.service_account import Credentials

_COMPUTE_ENGINE_SERVICE_ID = "6F81-5844-456A"
_HOURS_PER_MONTH = 730.0

# Module-level SKU cache
_sku_cache: dict[str, tuple[list, float]] = {}
_SKU_TTL = 3600  # 1 hour

# Maps SKU description prefix (lowercase) → machine family key.
# Order matters: longer/more-specific prefixes must come first.
_DESC_PREFIX_TO_FAMILY: list[tuple[str, str]] = [
    ("n2d amd ", "n2d"),
    ("n2 ", "n2"),
    ("n1 ", "n1"),
    ("n4 ", "n4"),
    ("e2 ", "e2"),
    ("c2d amd ", "c2d"),
    ("c2 ", "c2"),
    ("c3d amd ", "c3d"),
    ("c3 ", "c3"),
    ("t2d amd ", "t2d"),
    ("t2a arm ", "t2a"),
    ("m1 ", "m1"),
    ("m2 ", "m2"),
    ("m3 ", "m3"),
    ("a2 ", "a2"),
    ("a3 ", "a3"),
]

# Fallback on-demand prices (USD/hr) from GCP pricing page — used when Catalog API is unavailable.
# Updated daily from the Catalog API when accessible; otherwise stays at these seeded values.
# Format: family -> region_group -> (cpu_per_vcpu_hr, ram_per_gb_hr)
_FALLBACK_PRICES: dict[str, dict[str, tuple[float, float]]] = {
    "n1":  {"americas": (0.031611, 0.004237), "emea": (0.037070, 0.004971), "apac": (0.036695, 0.004921)},
    "n2":  {"americas": (0.031611, 0.004246), "emea": (0.034852, 0.004677), "apac": (0.036685, 0.004920)},
    "n2d": {"americas": (0.028877, 0.003870), "emea": (0.031862, 0.004273), "apac": (0.033404, 0.004479)},
    "n4":  {"americas": (0.036836, 0.004948), "emea": (0.040616, 0.005453), "apac": (0.042619, 0.005722)},
    "e2":  {"americas": (0.021811, 0.002923), "emea": (0.024034, 0.003223), "apac": (0.025285, 0.003392)},
    "c2":  {"americas": (0.034180, 0.004590), "emea": (0.037720, 0.005060), "apac": (0.039640, 0.005320)},
    "c2d": {"americas": (0.029563, 0.003964), "emea": (0.032605, 0.004372), "apac": (0.034229, 0.004593)},
    "c3":  {"americas": (0.035520, 0.004760), "emea": (0.039180, 0.005250), "apac": (0.041140, 0.005520)},
    "t2d": {"americas": (0.026600, 0.003560), "emea": (0.029330, 0.003930), "apac": (0.030800, 0.004130)},
    "m1":  {"americas": (0.040320, 0.005406), "emea": (0.046450, 0.006230), "apac": (0.048620, 0.006520)},
}


def _region_group(zone: str) -> str:
    region = "-".join(zone.split("-")[:-1])
    return _region_group_from_region(region)


def _region_group_from_region(region: str) -> str:
    if region.startswith(("us-", "northamerica-", "southamerica-")):
        return "americas"
    if region.startswith(("europe-", "me-", "africa-")):
        return "emea"
    return "apac"


def _fallback_price(machine_type: str, zone: str, vcpus: int, memory_gib: float) -> float | None:
    family = machine_type.split("-")[0].lower()
    prices = _FALLBACK_PRICES.get(family, {}).get(_region_group(zone))
    if not prices:
        return None
    cpu_price, ram_price = prices
    return round(vcpus * cpu_price + memory_gib * ram_price, 4)


def _get_sku_desc_prefix(machine_type: str) -> str | None:
    """Return the SKU description prefix for a given machine type, or None if unsupported."""
    mt = machine_type.lower()
    # Families that use "Predefined"/"Custom" in SKU descriptions
    standard_families = [
        ("n1-", "N1"),
        ("n2d-", "N2D AMD"),
        ("n2-", "N2"),
        ("n4-", "N4"),
        ("c2d-", "C2D AMD"),
        ("c2-", "C2"),
        ("c3d-", "C3D AMD"),
        ("c3-", "C3"),
        ("t2d-", "T2D AMD"),
        ("t2a-", "T2A ARM"),
        ("m1-", "M1"),
        ("m2-", "M2"),
        ("m3-", "M3"),
        ("a2-", "A2"),
        ("a3-", "A3"),
    ]
    for prefix, family in standard_families:
        if mt.startswith(prefix):
            kind = "custom" if "custom" in mt else "predefined"
            return f"{family} {kind} instance"

    # E2: shared-core variants have flat pricing; predefined uses "E2 Instance" (no "Predefined")
    if mt.startswith("e2-micro") or mt.startswith("e2-small"):
        return None
    if mt.startswith("e2-"):
        return "E2 Custom Instance" if "custom" in mt else "E2 Instance"

    return None


def _extract_unit_price(sku: dict) -> float | None:
    for pi in sku.get("pricingInfo", []):
        for rate in pi.get("pricingExpression", {}).get("tieredRates", []):
            if rate.get("startUsageAmount", 0) == 0:
                up = rate.get("unitPrice", {})
                return int(up.get("units", 0)) + up.get("nanos", 0) / 1_000_000_000
    return None


class GCPBillingService:
    def __init__(self, credentials: Credentials, project_id: str):
        self._credentials = credentials
        self._project_id = project_id

    def _session(self) -> AuthorizedSession:
        return AuthorizedSession(self._credentials)

    async def _run(self, fn):
        return await asyncio.get_running_loop().run_in_executor(None, fn)

    async def get_project_billing_info(self) -> dict:
        def _fetch():
            s = self._session()
            r = s.get(
                f"https://cloudbilling.googleapis.com/v1/projects/{self._project_id}/billingInfo"
            )
            r.raise_for_status()
            return r.json()

        return await self._run(_fetch)

    async def get_billing_account_display_name(self, billing_account_id: str) -> str:
        def _fetch():
            s = self._session()
            r = s.get(
                f"https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account_id}"
            )
            r.raise_for_status()
            return r.json().get("displayName", billing_account_id)

        return await self._run(_fetch)

    async def get_hourly_price(self, machine_type: str, zone: str, vcpus: int, memory_gib: float) -> dict:
        """Return estimated on-demand hourly price in USD, or None if unavailable."""
        desc_prefix = _get_sku_desc_prefix(machine_type)
        if desc_prefix is None:
            return None

        region = "-".join(zone.split("-")[:-1])  # europe-west4-a → europe-west4
        cache_key = str(self._credentials.service_account_email) if hasattr(self._credentials, "service_account_email") else "default"

        # Fetch SKUs (with cache)
        cached = _sku_cache.get(cache_key)
        if cached and time.time() - cached[1] < _SKU_TTL:
            skus = cached[0]
        else:
            def _fetch_skus():
                # Use authenticated session — unauthenticated requests return 403
                session = AuthorizedSession(self._credentials)
                result, token = [], None
                while True:
                    params: dict = {"pageSize": 5000, "currencyCode": "USD"}
                    if token:
                        params["pageToken"] = token
                    r = session.get(
                        f"https://cloudbilling.googleapis.com/v1/services/{_COMPUTE_ENGINE_SERVICE_ID}/skus",
                        params=params,
                        timeout=30,
                    )
                    r.raise_for_status()
                    data = r.json()
                    result.extend(data.get("skus", []))
                    token = data.get("nextPageToken")
                    if not token:
                        break
                return result

            try:
                skus = await self._run(_fetch_skus)
                _sku_cache[cache_key] = (skus, time.time())
            except Exception:
                fallback = _fallback_price(machine_type, zone, vcpus, memory_gib)
                return {"price_usd": fallback, "source": "fallback" if fallback is not None else None}

        prefix_lower = desc_prefix.lower()
        cpu_price: float | None = None
        ram_price: float | None = None

        for sku in skus:
            cat = sku.get("category", {})
            if cat.get("usageType") != "OnDemand":
                continue
            if cat.get("resourceFamily") != "Compute":
                continue
            if region not in sku.get("serviceRegions", []):
                continue

            desc = sku.get("description", "").lower()
            if not desc.startswith(prefix_lower):
                continue

            rg = cat.get("resourceGroup", "")
            price = _extract_unit_price(sku)
            if price is None:
                continue

            if rg == "CPU" and cpu_price is None:
                cpu_price = price
            elif rg == "RAM" and ram_price is None:
                # RAM is billed per GiB-month → convert to per GiB-hour
                ram_price = price / _HOURS_PER_MONTH

        if cpu_price is not None and ram_price is not None:
            return {"price_usd": round(vcpus * cpu_price + memory_gib * ram_price, 4), "source": "catalog"}

        # Fall back to hardcoded table
        fallback = _fallback_price(machine_type, zone, vcpus, memory_gib)
        if fallback is not None:
            return {"price_usd": fallback, "source": "fallback"}
        return {"price_usd": None, "source": None}

    async def get_costs(self, billing_account_id: str, start: date, end: date) -> dict:
        def _fetch():
            s = self._session()
            params = {
                "dateRange.startDate.year": start.year,
                "dateRange.startDate.month": start.month,
                "dateRange.startDate.day": start.day,
                "dateRange.endDate.year": end.year,
                "dateRange.endDate.month": end.month,
                "dateRange.endDate.day": end.day,
            }
            r = s.get(
                f"https://cloudbilling.googleapis.com/v2beta/billingAccounts/{billing_account_id}/reports",
                params=params,
            )
            r.raise_for_status()
            return r.json()

        return await self._run(_fetch)


async def refresh_fallback_prices(credentials=None) -> bool:
    """Fetch live SKU prices from the Catalog API and update _FALLBACK_PRICES in-place.

    Returns True if the table was successfully updated, False otherwise (existing
    hardcoded values are kept on failure).
    """
    def _fetch_all_skus():
        if credentials is not None:
            session = AuthorizedSession(credentials)
            def _get(url, params):
                return session.get(url, params=params, timeout=30)
        else:
            def _get(url, params):
                return httpx.get(url, params=params, timeout=30)

        result, token = [], None
        while True:
            params: dict = {"pageSize": 5000, "currencyCode": "USD"}
            if token:
                params["pageToken"] = token
            r = _get(
                f"https://cloudbilling.googleapis.com/v1/services/{_COMPUTE_ENGINE_SERVICE_ID}/skus",
                params,
            )
            r.raise_for_status()
            data = r.json()
            result.extend(data.get("skus", []))
            token = data.get("nextPageToken")
            if not token:
                break
        return result

    try:
        skus = await asyncio.get_running_loop().run_in_executor(None, _fetch_all_skus)
    except Exception:
        return False

    # Build: {family: {region_group: {"cpu": float, "ram": float}}}
    new: dict[str, dict[str, dict[str, float]]] = {}

    for sku in skus:
        cat = sku.get("category", {})
        if cat.get("usageType") != "OnDemand":
            continue
        if cat.get("resourceFamily") != "Compute":
            continue
        rg = cat.get("resourceGroup")
        if rg not in ("CPU", "RAM"):
            continue

        desc = sku.get("description", "").lower()
        family = next(
            (fam for prefix, fam in _DESC_PREFIX_TO_FAMILY if desc.startswith(prefix)),
            None,
        )
        if family is None:
            continue

        price = _extract_unit_price(sku)
        if price is None:
            continue
        if rg == "RAM":
            price = price / _HOURS_PER_MONTH

        for region in sku.get("serviceRegions", []):
            rgroup = _region_group_from_region(region)
            fam_entry = new.setdefault(family, {})
            rg_entry = fam_entry.setdefault(rgroup, {})
            key = "cpu" if rg == "CPU" else "ram"
            # Keep first price encountered per family/region_group/resource
            rg_entry.setdefault(key, price)

    # Convert to tuple format
    updated = {
        family: {
            rgroup: (prices["cpu"], prices["ram"])
            for rgroup, prices in regions.items()
            if "cpu" in prices and "ram" in prices
        }
        for family, regions in new.items()
    }
    updated = {f: r for f, r in updated.items() if r}  # drop families with no complete entries

    if not updated:
        return False

    _FALLBACK_PRICES.clear()
    _FALLBACK_PRICES.update(updated)
    return True
