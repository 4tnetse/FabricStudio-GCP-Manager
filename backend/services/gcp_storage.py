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
        _apply_cors(bucket)
    except NotFound:
        try:
            bucket = client.create_bucket(bucket_name)
            _apply_cors(bucket)
        except Conflict:
            # Created by a concurrent request; try to apply CORS anyway
            try:
                _apply_cors(client.get_bucket(bucket_name))
            except Exception:
                pass
    return bucket_name


def create_resumable_upload_url(credentials, project_id: str, bucket_name: str, object_name: str) -> str:
    """Initiate a GCS resumable upload and return the session URI.

    The caller uploads the file directly to this URL with a PUT request.
    """
    client = _client(credentials, project_id)
    blob = client.bucket(bucket_name).blob(object_name)
    return blob.create_resumable_upload_session(content_type="application/octet-stream")


def delete_object(credentials, project_id: str, bucket_name: str, object_name: str) -> None:
    """Delete a GCS object; silently ignores not-found errors."""
    client = _client(credentials, project_id)
    try:
        client.bucket(bucket_name).blob(object_name).delete()
    except NotFound:
        pass
