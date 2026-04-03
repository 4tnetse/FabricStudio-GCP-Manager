"""
Workshop Registration Portal — FastAPI app for Cloud Run.

Environment variables:
  WORKSHOP_ID            — Firestore workshop document ID
  FIRESTORE_PROJECT_ID   — GCP project ID
  FIRESTORE_DATABASE_ID  — Firestore database ID (default: fabricstudio-gcp-manager)
  PORT                   — HTTP port (default: 8080)
"""
import os
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Request, Form, Response
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from google.cloud import firestore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WORKSHOP_ID = os.environ["WORKSHOP_ID"]
FIRESTORE_PROJECT_ID = os.environ["FIRESTORE_PROJECT_ID"]
FIRESTORE_DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "fabricstudio-gcp-manager")

MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# ---------------------------------------------------------------------------
# App + Firestore client
# ---------------------------------------------------------------------------

app = FastAPI(docs_url=None, redoc_url=None)
templates = Jinja2Templates(directory="templates")

db = firestore.Client(project=FIRESTORE_PROJECT_ID, database=FIRESTORE_DATABASE_ID)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _workshop_ref():
    return db.collection("workshops").document(WORKSHOP_ID)


def _rate_limit_ref(session_id: str):
    return db.collection("portal_rate_limits").document(session_id)


def _get_workshop():
    doc = _workshop_ref().get()
    if not doc.exists:
        raise RuntimeError("Workshop not found in Firestore.")
    return doc.to_dict()


def _get_or_create_session(request: Request, response: Response) -> str:
    session_id = request.cookies.get("_session")
    if not session_id:
        session_id = secrets.token_hex(16)
        response.set_cookie(
            "_session",
            session_id,
            httponly=True,
            samesite="strict",
            max_age=86400 * 7,
        )
    return session_id


def _check_lock(session_id: str) -> tuple[bool, int]:
    """Return (is_locked, minutes_remaining)."""
    doc = _rate_limit_ref(session_id).get()
    if not doc.exists:
        return False, 0
    data = doc.to_dict()
    locked_until = data.get("locked_until")
    if locked_until is None:
        return False, 0
    now = datetime.now(timezone.utc)
    if hasattr(locked_until, "tzinfo") and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until > now:
        remaining = int((locked_until - now).total_seconds() / 60) + 1
        return True, remaining
    return False, 0


def _increment_attempts(session_id: str) -> int:
    """Increment attempt counter; lock if threshold reached. Returns new attempt count."""
    ref = _rate_limit_ref(session_id)
    doc = ref.get()
    now = datetime.now(timezone.utc)
    if doc.exists:
        data = doc.to_dict()
        attempts = data.get("attempts", 0) + 1
    else:
        attempts = 1

    update: dict = {"attempts": attempts, "last_attempt": now, "locked_until": None}
    if attempts >= MAX_ATTEMPTS:
        update["locked_until"] = now + timedelta(minutes=LOCKOUT_MINUTES)

    ref.set(update)
    return attempts


def _clear_rate_limit(session_id: str) -> None:
    _rate_limit_ref(session_id).delete()


def _find_next_instance(workshop: dict) -> str | None:
    """Return the lowest-numbered unclaimed instance_name, or None if all taken."""
    base_name = workshop.get("instance_base_name", "")
    count_start = int(workshop.get("count_start", 1))
    count_end = int(workshop.get("count_end", 1))

    attendees = _workshop_ref().collection("attendees").stream()
    claimed = {a.to_dict().get("instance_name") for a in attendees}

    for n in range(count_start, count_end + 1):
        candidate = f"{base_name}-{n:03d}"
        if candidate not in claimed:
            return candidate
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
async def register_form(request: Request):
    response = templates.TemplateResponse(
        "register.html",
        {"request": request, "workshop_name": _get_workshop().get("name", "Workshop"), "error": None},
    )
    # Ensure session cookie is set
    session_id = request.cookies.get("_session")
    if not session_id:
        session_id = secrets.token_hex(16)
        response.set_cookie(
            "_session",
            session_id,
            httponly=True,
            samesite="strict",
            max_age=86400 * 7,
        )
    return response


@app.post("/register", response_class=HTMLResponse)
async def register(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    company: str = Form(...),
    passphrase: str = Form(...),
):
    # Ensure a session exists
    plain_response = Response()
    session_id = _get_or_create_session(request, plain_response)
    workshop = _get_workshop()
    workshop_name = workshop.get("name", "Workshop")

    def render_register(error: str):
        return templates.TemplateResponse(
            "register.html",
            {"request": request, "workshop_name": workshop_name, "error": error},
        )

    def render_locked(minutes: int):
        return templates.TemplateResponse(
            "locked.html",
            {"request": request, "workshop_name": workshop_name, "minutes": minutes},
        )

    # 1. Check lock
    is_locked, minutes_remaining = _check_lock(session_id)
    if is_locked:
        return render_locked(minutes_remaining)

    # 2. Validate passphrase
    if passphrase != workshop.get("passphrase", ""):
        attempts = _increment_attempts(session_id)
        if attempts >= MAX_ATTEMPTS:
            _, mins = _check_lock(session_id)
            return render_locked(mins)
        return render_register("Incorrect details. Please try again.")

    # 3. Find next unclaimed instance
    instance_name = _find_next_instance(workshop)
    if instance_name is None:
        return render_register("No slots available. Please contact the workshop organiser.")

    # 4. Create attendee document
    attendee_data = {
        "instance_name": instance_name,
        "name": name,
        "email": email,
        "company": company,
        "registered_at": datetime.now(timezone.utc),
    }
    _workshop_ref().collection("attendees").add(attendee_data)

    # 5. Clear rate limit
    _clear_rate_limit(session_id)

    # 6. Derive FQDN
    dns_domain = workshop.get("dns_domain", "")
    fqdn = f"{instance_name}.{dns_domain}" if dns_domain else instance_name

    # 7. Render success
    response = templates.TemplateResponse(
        "success.html",
        {
            "request": request,
            "workshop_name": workshop_name,
            "fqdn": fqdn,
            "guest_password": workshop.get("guest_password", ""),
            "doc_link": workshop.get("doc_link") or None,
        },
    )
    response.set_cookie(
        "_session",
        session_id,
        httponly=True,
        samesite="strict",
        max_age=86400 * 7,
    )
    return response
