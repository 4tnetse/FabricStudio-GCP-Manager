import asyncio
from collections import defaultdict
from datetime import datetime, timezone

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


def _parse_cron_datetime(cron: str, timezone_str: str) -> datetime | None:
    """Parse a fixed cron expression (minute hour day month *) into a UTC datetime."""
    try:
        import zoneinfo
        parts = cron.strip().split()
        if len(parts) != 5:
            return None
        minute, hour, day, month = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
        tz = zoneinfo.ZoneInfo(timezone_str)
        year = datetime.now(tz).year
        dt = datetime(year, month, day, hour, minute, tzinfo=tz)
        if dt < datetime.now(timezone.utc):
            dt = datetime(year + 1, month, day, hour, minute, tzinfo=tz)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


async def _fetch_prices(compute: GCPComputeService, billing: GCPBillingService, combos: list[tuple]) -> dict:
    prices: dict[tuple, float | None] = {}

    async def _fetch(mt: str, zone: str):
        try:
            specs = await compute.get_machine_type_specs(zone, mt)
            p = await billing.get_hourly_price(mt, zone, specs["vcpus"], specs["memory_gib"])
            prices[(mt, zone)] = p["price_usd"] if p else None
        except Exception:
            prices[(mt, zone)] = None

    await asyncio.gather(*[_fetch(mt, z) for mt, z in combos])
    return prices


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


@router.get("/instances")
async def get_instance_costs():
    """Items 1–6: per-instance hourly/daily/monthly costs and totals for all running instances."""
    compute = _get_compute_service()
    billing = _get_billing_service()

    instances = await compute.list_instances()
    running = [i for i in instances if i.status.value == "RUNNING"]

    combos = list({(i.machine_type, i.zone) for i in running})
    prices = await _fetch_prices(compute, billing, combos)

    result = []
    for inst in running:
        hourly = prices.get((inst.machine_type, inst.zone))
        result.append({
            "name": inst.name,
            "zone": inst.zone,
            "machine_type": inst.machine_type,
            "group": (inst.labels or {}).get("group", ""),
            "hourly_usd": round(hourly, 6) if hourly else None,
            "daily_usd": round(hourly * 24, 4) if hourly else None,
            "monthly_usd": round(hourly * 24 * 30, 2) if hourly else None,
        })

    result.sort(key=lambda x: (x["group"] or "\xff", x["name"]))

    total_hourly = sum(r["hourly_usd"] for r in result if r["hourly_usd"])
    return {
        "instances": result,
        "totals": {
            "count": len(result),
            "hourly_usd": round(total_hourly, 4),
            "daily_usd": round(total_hourly * 24, 2),
            "monthly_usd": round(total_hourly * 24 * 30, 2),
        },
    }


@router.get("/workshops")
async def get_workshop_costs():
    """Item 7: cost per workshop group from instance creation to scheduled deletion."""
    compute = _get_compute_service()
    billing = _get_billing_service()

    instances = await compute.list_instances()
    running = [i for i in instances if i.status.value == "RUNNING"]

    combos = list({(i.machine_type, i.zone) for i in running})
    prices = await _fetch_prices(compute, billing, combos)

    # Group by 'group' label
    groups: dict[str, list] = defaultdict(list)
    for inst in running:
        group = (inst.labels or {}).get("group") or "—"
        groups[group].append(inst)

    # Build instance name → group index for matching delete schedules
    name_to_group = {inst.name: grp for grp, insts in groups.items() for inst in insts}

    # Fetch delete schedules from Firestore
    delete_schedules: list[dict] = []
    try:
        from services import firestore_client as fs
        all_schedules = await fs.list_schedules(project_id=cfg.settings.active_project_id)
        delete_schedules = [s for s in all_schedules if s.get("job_type") == "delete"]
    except Exception:
        pass

    # Match delete schedules to groups via instance names in their payload
    group_to_delete: dict[str, dict] = {}
    for sched in delete_schedules:
        payload_names = {pi.get("name", "") for pi in sched.get("payload", {}).get("instances", [])}
        matched = {name_to_group[n] for n in payload_names if n in name_to_group}
        for grp in matched:
            if grp not in group_to_delete:
                group_to_delete[grp] = sched

    now = datetime.now(timezone.utc)
    workshops = []

    for group_name, group_instances in sorted(groups.items()):
        # Earliest creation time
        start_time = None
        for inst in group_instances:
            if inst.creation_timestamp:
                try:
                    ct = datetime.fromisoformat(inst.creation_timestamp.replace("Z", "+00:00"))
                    if start_time is None or ct < start_time:
                        start_time = ct
                except Exception:
                    pass

        hours_running = (now - start_time).total_seconds() / 3600 if start_time else None
        total_hourly = sum(prices.get((i.machine_type, i.zone), 0) or 0 for i in group_instances)
        cost_so_far = round(total_hourly * hours_running, 2) if hours_running and total_hourly else None

        # Delete schedule
        delete_sched = group_to_delete.get(group_name)
        delete_time = None
        projected_total = None
        if delete_sched:
            delete_time = _parse_cron_datetime(
                delete_sched.get("cron_expression", ""),
                delete_sched.get("timezone", "UTC"),
            )
            if delete_time and start_time and total_hourly:
                total_hours = (delete_time - start_time).total_seconds() / 3600
                if total_hours > 0:
                    projected_total = round(total_hourly * total_hours, 2)

        workshops.append({
            "group": group_name,
            "instance_count": len(group_instances),
            "start_time": start_time.isoformat() if start_time else None,
            "hours_running": round(hours_running, 1) if hours_running else None,
            "hourly_total_usd": round(total_hourly, 4),
            "cost_so_far_usd": cost_so_far,
            "delete_schedule_name": delete_sched.get("name") if delete_sched else None,
            "delete_time": delete_time.isoformat() if delete_time else None,
            "projected_total_usd": projected_total,
        })

    return {"workshops": workshops}


@router.get("/projected")
async def get_projected_costs():
    """Item 8: projected total cost for the current month."""
    compute = _get_compute_service()
    billing = _get_billing_service()

    instances = await compute.list_instances()
    running = [i for i in instances if i.status.value == "RUNNING"]

    combos = list({(i.machine_type, i.zone) for i in running})
    prices = await _fetch_prices(compute, billing, combos)

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        month_end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        month_end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)

    hours_remaining = (month_end - now).total_seconds() / 3600
    total_hourly = sum(prices.get((i.machine_type, i.zone), 0) or 0 for i in running)

    # Accrued this month: hours each running instance has been up since month start
    accrued = 0.0
    for inst in running:
        hourly = prices.get((inst.machine_type, inst.zone), 0) or 0
        if inst.creation_timestamp:
            try:
                ct = datetime.fromisoformat(inst.creation_timestamp.replace("Z", "+00:00"))
                effective_start = max(ct, month_start)
                accrued += hourly * (now - effective_start).total_seconds() / 3600
            except Exception:
                pass

    # Projected cost for remaining hours (current running instances)
    projected_remaining = total_hourly * hours_remaining

    # Scheduled workshops: future clone+delete pairs within this month
    scheduled_cost = 0.0
    try:
        from services import firestore_client as fs
        all_schedules = await fs.list_schedules(project_id=cfg.settings.active_project_id)
        clone_scheds = [s for s in all_schedules if s.get("job_type") == "clone" and s.get("enabled")]
        delete_scheds = [s for s in all_schedules if s.get("job_type") == "delete" and s.get("enabled")]

        for clone_sched in clone_scheds:
            clone_time = _parse_cron_datetime(
                clone_sched.get("cron_expression", ""), clone_sched.get("timezone", "UTC")
            )
            if not clone_time or clone_time <= now:
                continue

            payload = clone_sched.get("payload", {})
            count_start = int(payload.get("count_start", 1))
            count_end = int(payload.get("count_end", 1))
            instance_count = max(count_end - count_start + 1, 1)
            machine_type = payload.get("machine_type", "")
            zone = payload.get("target_zone") or payload.get("zone", "")

            hourly_per = 0.0
            if machine_type and zone:
                try:
                    specs = await compute.get_machine_type_specs(zone, machine_type)
                    p = await billing.get_hourly_price(machine_type, zone, specs["vcpus"], specs["memory_gib"])
                    hourly_per = p["price_usd"] if p else 0.0
                except Exception:
                    pass

            # Find matching delete schedule by name similarity
            clone_base = (payload.get("clone_base_name") or "").lower()
            delete_time = None
            for del_sched in delete_scheds:
                del_name = (del_sched.get("name") or "").lower()
                if clone_base and clone_base in del_name:
                    delete_time = _parse_cron_datetime(
                        del_sched.get("cron_expression", ""), del_sched.get("timezone", "UTC")
                    )
                    break

            if delete_time and delete_time > clone_time and hourly_per:
                duration_hours = (delete_time - clone_time).total_seconds() / 3600
                scheduled_cost += instance_count * hourly_per * duration_hours
    except Exception:
        pass

    return {
        "month": now.strftime("%Y-%m"),
        "accrued_usd": round(accrued, 2),
        "projected_remaining_usd": round(projected_remaining, 2),
        "scheduled_workshops_usd": round(scheduled_cost, 2),
        "projected_total_usd": round(accrued + projected_remaining + scheduled_cost, 2),
        "hours_remaining": round(hours_remaining, 1),
        "running_count": len(running),
        "hourly_rate_usd": round(total_hourly, 4),
    }
