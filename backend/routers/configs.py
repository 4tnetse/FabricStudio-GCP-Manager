import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/configs", tags=["configs"])

CONF_DIR = Path("/Users/tijlvermant/fabricstudio-gcp/FortiPoC-Toolkit-for-GCP/conf")

# Matches KEY="value" or KEY='value' or KEY=value (no quotes)
_KV_RE = re.compile(
    r"""^([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(.*))$"""
)


def _parse_conf(content: str) -> dict:
    result: dict[str, str] = {}
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        m = _KV_RE.match(stripped)
        if m:
            key = m.group(1)
            # One of the capture groups will have the value
            value = m.group(2) if m.group(2) is not None else (
                m.group(3) if m.group(3) is not None else (
                    m.group(4) if m.group(4) is not None else ""
                )
            )
            result[key] = value
    return result


def _safe_name(name: str) -> Path:
    """Return a safe path for the given config name (must end in .conf)."""
    # Strip directory traversal
    safe = Path(name).name
    if not safe.endswith(".conf"):
        safe = safe + ".conf"
    return CONF_DIR / safe


class ConfigCreateRequest(BaseModel):
    name: str
    content: str


class ConfigUpdateRequest(BaseModel):
    content: str


@router.get("")
async def list_configs():
    CONF_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(CONF_DIR.glob("*.conf"))
    return [
        {
            "name": f.name,
            "size": f.stat().st_size,
        }
        for f in files
    ]


@router.get("/{name}")
async def get_config(name: str):
    path = _safe_name(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Config file '{name}' not found")
    content = path.read_text()
    parsed = _parse_conf(content)
    return {"name": path.name, "content": content, "parsed": parsed}


@router.post("")
async def create_config(body: ConfigCreateRequest):
    path = _safe_name(body.name)
    CONF_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content)
    return {"detail": f"Config '{path.name}' created", "name": path.name}


@router.put("/{name}")
async def update_config(name: str, body: ConfigUpdateRequest):
    path = _safe_name(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Config file '{name}' not found")
    path.write_text(body.content)
    return {"detail": f"Config '{path.name}' updated"}


@router.delete("/{name}")
async def delete_config(name: str):
    path = _safe_name(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Config file '{name}' not found")
    path.unlink()
    return {"detail": f"Config '{path.name}' deleted"}
