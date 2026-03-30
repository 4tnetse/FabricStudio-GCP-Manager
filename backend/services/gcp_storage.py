"""GCS helpers for image import staging."""
from google.api_core.exceptions import Conflict, NotFound
from google.cloud import storage


def _client(credentials, project_id: str) -> storage.Client:
    return storage.Client(credentials=credentials, project=project_id)


_CORS = [
    {
        "origin": ["*"],
        "method": ["PUT", "OPTIONS"],
        "responseHeader": ["Content-Type"],
        "maxAgeSeconds": 3600,
    }
]


def _apply_cors(bucket) -> None:
    """Set CORS on a bucket if not already configured."""
    if not bucket.cors:
        bucket.cors = _CORS
        bucket.patch()


def ensure_staging_bucket(credentials, project_id: str) -> str:
    """Return the staging bucket name, creating it if it does not exist.

    Also ensures CORS is configured so the browser can upload directly to GCS.
    """
    bucket_name = f"{project_id}-fs-image-import"
    client = _client(credentials, project_id)
    try:
        bucket = client.get_bucket(bucket_name)
        print(f"[gcp_storage] bucket exists: {bucket_name}", flush=True)
        _apply_cors(bucket)
    except NotFound:
        print(f"[gcp_storage] bucket not found, creating: {bucket_name}", flush=True)
        try:
            bucket = client.create_bucket(bucket_name)
            print(f"[gcp_storage] bucket created: {bucket_name}", flush=True)
            _apply_cors(bucket)
        except Conflict:
            # Created by a concurrent request; try to apply CORS anyway
            try:
                _apply_cors(client.get_bucket(bucket_name))
            except Exception:
                pass
    print(f"[gcp_storage] CORS: {bucket.cors}", flush=True)
    return bucket_name


def create_resumable_upload_url(credentials, project_id: str, bucket_name: str, object_name: str, origin: str = "http://localhost:5173") -> str:
    """Initiate a GCS resumable upload and return the session URI.

    The origin parameter must match the browser's origin so GCS includes
    Access-Control-Allow-Origin in the upload response.
    """
    client = _client(credentials, project_id)
    blob = client.bucket(bucket_name).blob(object_name)
    url = blob.create_resumable_upload_session(content_type="application/octet-stream", origin=origin)
    print(f"[gcp_storage] resumable session URL (first 80 chars): {str(url)[:80]}", flush=True)
    return url


def delete_object(credentials, project_id: str, bucket_name: str, object_name: str) -> None:
    """Delete a GCS object; silently ignores not-found errors."""
    client = _client(credentials, project_id)
    try:
        client.bucket(bucket_name).blob(object_name).delete()
    except NotFound:
        pass
