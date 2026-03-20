from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

import config as cfg
from auth import get_credentials
from models.instance import MachineTypeRequest, MoveRequest, RenameRequest
from services.gcp_compute import GCPComputeService
from services.dns_helpers import create_dns_for_instance, delete_dns_for_instance

router = APIRouter(prefix="/instances", tags=["instances"])


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


@router.get("/zones")
async def list_zones():
    svc = _get_service()
    return await svc.list_zones()


@router.get("")
async def list_instances(
    zone: str | None = Query(default=None),
    product: str | None = Query(default=None),
    status: str | None = Query(default=None),
    prepend: str | None = Query(default=None),
):
    svc = _get_service()

    # Build a GCP filter string from query parameters
    filter_parts = []
    if status:
        filter_parts.append(f"status={status.upper()}")
    if product:
        filter_parts.append(f"name:*-{product}-*")
    if prepend:
        filter_parts.append(f"name:*-{prepend}-*")
    filter_str = " AND ".join(filter_parts) if filter_parts else None

    instances = await svc.list_instances(zone=zone, filter_str=filter_str)

    # Additional client-side filtering for prepend/product since GCP name filters are prefix-based
    if product:
        instances = [i for i in instances if f"-{product}-" in i.name]
    if prepend:
        instances = [i for i in instances if f"-{prepend}-" in i.name]

    return [i.model_dump() for i in instances]


@router.get("/public-ips")
async def list_public_ips():
    svc = _get_service()
    instances = await svc.list_instances(filter_str="status=RUNNING")
    result = []
    for inst in instances:
        if inst.public_ip:
            result.append({"name": inst.name, "ip": inst.public_ip})
    return result


@router.get("/{zone}/{name}")
async def get_instance(zone: str, name: str):
    svc = _get_service()
    try:
        instance = await svc.get_instance(zone=zone, name=name)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Instance not found: {exc}")
    return instance.model_dump()


@router.post("/{zone}/{name}/start")
async def start_instance(zone: str, name: str, background_tasks: BackgroundTasks):
    svc = _get_service()
    try:
        await svc.start_instance(zone=zone, name=name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to start instance: {exc}")
    background_tasks.add_task(create_dns_for_instance, name, zone)
    return {"detail": f"Instance {name} started"}


@router.post("/{zone}/{name}/stop")
async def stop_instance(zone: str, name: str, background_tasks: BackgroundTasks):
    svc = _get_service()
    try:
        await svc.stop_instance(zone=zone, name=name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to stop instance: {exc}")
    background_tasks.add_task(delete_dns_for_instance, name)
    return {"detail": f"Instance {name} stopped"}


@router.delete("/{zone}/{name}")
async def delete_instance(zone: str, name: str, background_tasks: BackgroundTasks):
    svc = _get_service()
    try:
        await svc.delete_instance(zone=zone, name=name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete instance: {exc}")
    background_tasks.add_task(delete_dns_for_instance, name)
    return {"detail": f"Instance {name} deleted"}


@router.patch("/{zone}/{name}/machine-type")
async def set_machine_type(zone: str, name: str, body: MachineTypeRequest):
    svc = _get_service()
    try:
        await svc.set_machine_type(zone=zone, name=name, machine_type=body.machine_type)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to change machine type: {exc}"
        )
    return {"detail": f"Machine type of {name} changed to {body.machine_type}"}


@router.patch("/{zone}/{name}/rename")
async def rename_instance(zone: str, name: str, body: RenameRequest):
    svc = _get_service()
    try:
        await svc.rename_instance(zone=zone, name=name, new_name=body.new_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rename instance: {exc}")
    return {"detail": f"Instance {name} renamed to {body.new_name}"}


@router.post("/{zone}/{name}/move")
async def move_instance(zone: str, name: str, body: MoveRequest):
    svc = _get_service()
    try:
        await svc.move_instance(
            zone=zone, name=name, destination_zone=body.destination_zone
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to move instance: {exc}")
    return {
        "detail": f"Instance {name} moved from {zone} to {body.destination_zone}"
    }
