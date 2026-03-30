import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel

import config as cfg
from auth import get_credentials
from services.gcp_compute import GCPComputeService
from services.gcp_storage import (
    create_resumable_upload_url,
    delete_object,
    ensure_staging_bucket,
)
from services.parallel_runner import job_manager

router = APIRouter(prefix="/images", tags=["images"])


def _get_service() -> GCPComputeService:
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    return GCPComputeService(creds, cfg.settings.active_project_id)


class ImagePatch(BaseModel):
    description: str


class ImageImportRequest(BaseModel):
    name: str
    gcs_uri: str
    bucket: str
    object_name: str
    family: str = ""
    description: str = ""


@router.get("")
async def list_images():
    svc = _get_service()
    try:
        images = await svc.list_images()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list images: {exc}")
    return images


@router.patch("/{name}")
async def update_image(name: str, body: ImagePatch):
    svc = _get_service()
    try:
        await svc.update_image_description(name, body.description)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update image: {exc}")
    return {"ok": True}


@router.get("/upload-url")
async def get_upload_url(request: Request, filename: str = Query(...)):
    if not filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Only .tar.gz files are supported.")
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    creds = get_credentials()
    project_id = cfg.settings.active_project_id
    # Same-origin requests don't include an Origin header; derive from Referer or Host.
    origin = request.headers.get("origin")
    if not origin:
        referer = request.headers.get("referer", "")
        if referer:
            parsed = urlparse(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}"
        else:
            host = request.headers.get("host", "localhost:5173")
            scheme = "https" if request.url.scheme == "https" else "http"
            origin = f"{scheme}://{host}"
    print(f"[images] get_upload_url: project={project_id} filename={filename} origin={origin}", flush=True)
    try:
        bucket_name = ensure_staging_bucket(creds, project_id)
        print(f"[images] staging bucket ready: {bucket_name}", flush=True)
        object_name = f"import-{uuid.uuid4()}/{filename}"
        upload_url = create_resumable_upload_url(creds, project_id, bucket_name, object_name, origin=origin)
        print(f"[images] resumable upload URL created for gs://{bucket_name}/{object_name}", flush=True)
    except Exception as exc:
        print(f"[images] get_upload_url failed: {exc}", flush=True)
        raise HTTPException(status_code=500, detail=f"Failed to prepare upload: {exc}")
    return {
        "upload_url": upload_url,
        "gcs_uri": f"gs://{bucket_name}/{object_name}",
        "bucket": bucket_name,
        "object_name": object_name,
    }


async def _import_job(job_id: str, req: ImageImportRequest) -> None:
    q = job_manager.jobs[job_id]
    failed = False
    try:
        print(f"[images] import_job start: name={req.name} gcs_uri={req.gcs_uri}", flush=True)
        await q.put(f"Creating GCP image '{req.name}' from {req.gcs_uri}…")
        svc = _get_service()
        await svc.import_image(req.name, req.gcs_uri, req.family, req.description)
        print(f"[images] import_job success: {req.name}", flush=True)
        await q.put(f"Image '{req.name}' created successfully.")
    except Exception as exc:
        print(f"[images] import_job failed: {exc}", flush=True)
        await q.put(f"ERROR: {exc}")
        failed = True
    finally:
        await q.put("Cleaning up staging file…")
        try:
            creds = get_credentials()
            delete_object(creds, cfg.settings.active_project_id, req.bucket, req.object_name)
            print(f"[images] staging file deleted: {req.bucket}/{req.object_name}", flush=True)
            await q.put("Staging file deleted.")
        except Exception as exc:
            print(f"[images] staging delete failed: {exc}", flush=True)
            await q.put(f"Warning: could not delete staging file: {exc}")
    await job_manager.mark_done(job_id, failed=failed)


class StagingCleanupRequest(BaseModel):
    bucket: str
    object_name: str


@router.post("/staging/cleanup")
async def cleanup_staging(body: StagingCleanupRequest):
    """Delete a staging GCS object — called when the user cancels an import."""
    if not cfg.settings.active_project_id:
        raise HTTPException(status_code=400, detail="No active project selected.")
    try:
        creds = get_credentials()
        delete_object(creds, cfg.settings.active_project_id, body.bucket, body.object_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {exc}")
    return {"ok": True}


@router.post("/import")
async def import_image(req: ImageImportRequest, background_tasks: BackgroundTasks):
    print(f"[images] POST /import received: name={req.name} gcs_uri={req.gcs_uri}", flush=True)
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id)
    background_tasks.add_task(_import_job, job_id, req)
    print(f"[images] POST /import returning job_id={job_id}", flush=True)
    return {"job_id": job_id}
