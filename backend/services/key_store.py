"""Multi-key store for GCP service account credentials."""
import json
import uuid
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from config import SETTINGS_DIR

KEYS_DIR = SETTINGS_DIR / "keys"
METADATA_FILE = KEYS_DIR / "metadata.json"

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


class ProjectInfo(BaseModel):
    id: str
    name: str


class KeyMeta(BaseModel):
    id: str
    display_name: str
    filename: str
    client_email: str = ""
    projects: list[ProjectInfo] = []


def _ensure_dir() -> None:
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        KEYS_DIR.chmod(0o700)
    except Exception:
        pass


def load_keys() -> list[KeyMeta]:
    if not METADATA_FILE.exists():
        return []
    try:
        data = json.loads(METADATA_FILE.read_text())
        return [KeyMeta(**k) for k in data]
    except Exception:
        return []


def save_keys(keys: list[KeyMeta]) -> None:
    _ensure_dir()
    METADATA_FILE.write_text(json.dumps([k.model_dump() for k in keys], indent=2))


def get_key_path(key_id: str) -> Path:
    return KEYS_DIR / f"{key_id}.json"


def find_key_for_project(project_id: str) -> Optional[KeyMeta]:
    for k in load_keys():
        for p in k.projects:
            if p.id == project_id:
                return k
    return None


def all_projects_annotated() -> list[dict]:
    """Return all projects across all keys, deduplicated, each annotated with key_id and key_name."""
    seen: set[str] = set()
    result = []
    for k in load_keys():
        for p in k.projects:
            if p.id not in seen:
                seen.add(p.id)
                result.append({"id": p.id, "name": p.name, "key_id": k.id, "key_name": k.display_name})
    return result


def add_key(file_bytes: bytes, original_filename: str, display_name: str | None = None) -> KeyMeta:
    """Save key file, probe GCP for projects, store metadata. Returns KeyMeta."""
    _ensure_dir()
    key_id = uuid.uuid4().hex
    dest = get_key_path(key_id)
    dest.write_bytes(file_bytes)
    try:
        dest.chmod(0o600)
    except Exception:
        pass

    client_email = ""
    try:
        key_data = json.loads(file_bytes)
        client_email = key_data.get("client_email", "")
    except Exception:
        pass

    projects = _probe_projects(str(dest))

    meta = KeyMeta(
        id=key_id,
        display_name=display_name or original_filename,
        filename=original_filename,
        client_email=client_email,
        projects=projects,
    )

    keys = load_keys()
    keys.append(meta)
    save_keys(keys)
    return meta


def _probe_projects(key_path: str) -> list[ProjectInfo]:
    """Try to list accessible projects for a key. Falls back to project_id in key file."""
    try:
        from google.oauth2 import service_account
        from google.cloud import resourcemanager_v3
        creds = service_account.Credentials.from_service_account_file(key_path, scopes=SCOPES)
        client = resourcemanager_v3.ProjectsClient(credentials=creds)
        projects = []
        for p in client.search_projects():
            projects.append(ProjectInfo(id=p.project_id, name=p.display_name or p.project_id))
        if projects:
            return projects
    except Exception:
        pass
    try:
        data = json.loads(Path(key_path).read_text())
        pid = data.get("project_id")
        if pid:
            return [ProjectInfo(id=pid, name=pid)]
    except Exception:
        pass
    return []


def delete_key(key_id: str) -> None:
    get_key_path(key_id).unlink(missing_ok=True)
    keys = [k for k in load_keys() if k.id != key_id]
    save_keys(keys)


def rename_key(key_id: str, new_name: str) -> KeyMeta:
    keys = load_keys()
    for k in keys:
        if k.id == key_id:
            k.display_name = new_name
            save_keys(keys)
            return k
    raise ValueError(f"Key {key_id} not found")


def migrate_from_legacy(key_path: str, key_name: str | None) -> KeyMeta | None:
    """Migrate a legacy single-key setup to the key store. Returns new KeyMeta or None."""
    path = Path(key_path)
    if not path.exists():
        return None
    try:
        file_bytes = path.read_bytes()
        return add_key(file_bytes, key_name or path.name, key_name or path.name)
    except Exception:
        return None
