# Scheduling Feature — Technical Design

**Branch:** `feature/scheduling`
**Status:** Draft

---

## Overview

Add scheduling of Clone and Configure jobs via GCP Cloud Run + Cloud Scheduler + Firestore. The local backend proxies schedule operations to a Cloud Run backend; Cloud Scheduler triggers jobs on a cron schedule; Firestore stores schedule definitions and job history.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      LOCAL MACHINE                               │
│                                                                  │
│  Browser                                                         │
│  ┌────────────────┐  HTTP   ┌────────────────────────────────┐  │
│  │ React Frontend │────────▶│ Local Backend (FastAPI)        │  │
│  │ /clone         │         │ port 1981                      │  │
│  │ /configure     │         │ ┌────────────────────────────┐ │  │
│  │ /schedules     │         │ │ Proxy layer                │ │  │
│  │ /settings      │         │ │ If remote_backend_url set: │ │  │
│  └────────────────┘         │ │  forward /api/schedules/*  │ │  │
│                             │ │  attach ID token header    │ │  │
│                             │ └────────────────────────────┘ │  │
│                             └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                      │ HTTPS + Bearer token
                                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                        GCP PROJECT                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Cloud Run  "fabricstudio-scheduler"                       │  │
│  │  Same Docker image, APP_MODE=backend                       │  │
│  │  Auth: require Google ID token                             │  │
│  │                                                            │  │
│  │  POST /api/schedules/trigger/{id}  ◀── Cloud Scheduler     │  │
│  │  GET/POST/PUT/DELETE /api/schedules/* ◀── Local backend    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────┐   ┌──────────────────────────────┐    │
│  │  Cloud Scheduler     │   │  Firestore                   │    │
│  │  one job per         │──▶│  schedules/                  │    │
│  │  schedule            │   │  job_runs/                   │    │
│  └──────────────────────┘   └──────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Firestore Data Model

### `schedules/{schedule_id}`

| Field | Type | Description |
|---|---|---|
| `id` | string | Document ID |
| `name` | string | Human label, e.g. "Nightly workshop clone" |
| `job_type` | string | `"clone"` or `"configure"` |
| `cron_expression` | string | 5-part cron, e.g. `"0 20 * * 1-5"` |
| `timezone` | string | IANA timezone, e.g. `"Europe/Brussels"` |
| `enabled` | bool | Whether Cloud Scheduler job is active |
| `project_id` | string | GCP project to operate on |
| `key_id` | string | Which service account key to use |
| `payload` | map | Job-type-specific parameters (see below) |
| `settings_snapshot` | map | Copy of relevant AppSettings at save time |
| `cloud_scheduler_job_name` | string | Full resource name of the Cloud Scheduler job |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `created_by` | string | `client_email` of the service account |

**Clone payload fields:** `source_name`, `zone`, `target_zone`, `clone_base_name`, `purpose`, `count_start`, `count_end`, `overwrite`

**Configure payload fields:** `instances`, `old_admin_password`, `admin_password`, `guest_password`, `trial_key`, `license_server`, `hostname_template`, `ssh_keys`, `delete_existing_keys`, `delete_all_workspaces`, `workspace_fabrics`

**Settings snapshot fields:** `dns_domain`, `instance_fqdn_prefix`, `dns_zone_name`, `fs_admin_password`, `default_zone`, `owner`

!!! note
    Passwords in the payload and settings snapshot are stored encrypted at rest by Firestore (GCP default AES-256). Migration to Cloud Secret Manager is a future improvement.

### `job_runs/{run_id}`

| Field | Type | Description |
|---|---|---|
| `id` | string | Document ID |
| `schedule_id` | string | Reference to `schedules/{id}` |
| `schedule_name` | string | Denormalized for display |
| `job_type` | string | `"clone"` or `"configure"` |
| `triggered_by` | string | `"scheduler"` or `"manual"` |
| `status` | string | `"running"`, `"completed"`, `"failed"` |
| `started_at` | timestamp | |
| `finished_at` | timestamp or null | |
| `log_lines` | list[string] | Up to 1000 lines: `"ISO_timestamp message"` |
| `error_summary` | string or null | Last error if failed |
| `project_id` | string | Which project was targeted |

**Retention:** last 50 runs per schedule. A daily Cloud Scheduler cleanup job deletes older documents.

---

## New API Endpoints

All endpoints live in `backend/routers/schedules.py` under `/api/schedules`.

### Schedule CRUD

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schedules` | List all schedules |
| `POST` | `/api/schedules` | Create schedule + Cloud Scheduler job |
| `GET` | `/api/schedules/{id}` | Get single schedule |
| `PUT` | `/api/schedules/{id}` | Update schedule |
| `DELETE` | `/api/schedules/{id}` | Delete schedule + Cloud Scheduler job |
| `POST` | `/api/schedules/{id}/enable` | Re-enable (resume Cloud Scheduler job) |
| `POST` | `/api/schedules/{id}/disable` | Disable (pause Cloud Scheduler job) |

### Job Execution

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/schedules/{id}/trigger` | Run now (called by Cloud Scheduler or manually) |
| `GET` | `/api/schedules/{id}/runs` | List run history for a schedule |
| `GET` | `/api/schedules/runs/{run_id}` | Get single run |
| `GET` | `/api/schedules/runs/{run_id}/logs` | Get log lines for a run |

### Proxy behaviour (local backend)

When `settings.remote_scheduling_enabled` is `true` and `settings.remote_backend_url` is set, all `/api/schedules/*` requests are proxied via `httpx.AsyncClient` to Cloud Run with `Authorization: Bearer <id_token>`. Otherwise returns HTTP 503 with an appropriate message ("Remote scheduling is disabled" or "Remote backend URL not configured").

### Cloud Run URL auto-detection

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schedules/cloud-run-url` | Queries Cloud Run API for the URL of `fabricstudio-scheduler` in the configured region |

---

## Authentication

### Local → Cloud Run

1. Load service account credentials from the active key file
2. Generate an ID token targeting the Cloud Run URL using `google.oauth2.service_account.IDTokenCredentials`
3. Cache token (valid 1 hour); refresh when expiry < 5 minutes
4. Attach as `Authorization: Bearer <token>` on all proxied requests

### Cloud Scheduler → Cloud Run

Cloud Scheduler uses an OIDC token generated automatically from the service account email configured on the scheduler job. No application-level validation needed — Cloud Run's built-in ingress handles it.

### Cloud Run ingress

Deployed with `--no-allow-unauthenticated`. GCP validates the Bearer token before forwarding to the application. No JWT validation code needed in the app.

---

## Cloud Run — Backend-Only Mode

The same Docker image runs in two modes controlled by the `APP_MODE` environment variable:

| Mode | Frontend | Scheduling | Background tasks |
|---|---|---|---|
| `full` (default) | Served from `frontend/dist` | Handled locally if Firestore configured | Daily price refresh |
| `backend` | Not served | Always handled directly | Skipped |

**`main.py` change:**
```python
import os
MODE = os.environ.get("APP_MODE", "full")

# Only start background tasks in full mode
if MODE == "full":
    asyncio.create_task(_daily_price_refresh())

# Only serve frontend in full mode
if MODE == "full" and _FRONTEND_DIST.exists():
    @app.get("/{full_path:path}", ...)
    async def spa_fallback(...): ...
```

**Cloud Run deployment:**
```bash
gcloud run deploy fabricstudio-scheduler \
  --image ghcr.io/4tnetse/fabricstudio-gcp-manager:latest \
  --no-allow-unauthenticated \
  --set-env-vars APP_MODE=backend \
  --memory 512Mi \
  --max-instances 3 \
  --region europe-west1
```

---

## Settings Changes

### New `AppSettings` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `remote_scheduling_enabled` | bool | `false` | Master switch — enables remote scheduling |
| `remote_backend_url` | string | `""` | Cloud Run URL, auto-detected or manually set |
| `cloud_run_region` | string | `"europe-west1"` | Region for Cloud Run + Cloud Scheduler jobs |
| `firestore_project_id` | string | `""` | GCP project hosting Firestore — auto-filled from active project ID when scheduling is enabled |

### Settings UI

New **Scheduling** section in Settings:

**Toggle (always visible):**

- **Enable remote scheduling** — switch button. When off, the scheduling section fields are hidden/disabled and all `/api/schedules/*` calls return 503.

**Fields (only shown when toggle is on):**

- **Cloud Run Region** — text input, default `europe-west1`
- **Remote Backend URL** — text input with a **Detect** button that calls `GET /api/schedules/cloud-run-url` to auto-fetch the URL from the Cloud Run API using the loaded service account key
- **Firestore Project ID** — text input, auto-filled with the active project ID when the toggle is switched on. Editable in case Firestore lives in a different project.

**Behaviour:**

- When the toggle is switched **off**: `remote_scheduling_enabled = false` is saved; the proxy layer in `schedules.py` returns 503; the **Schedules** nav item is greyed out (same `disabled` style as other nav items when no key is loaded)
- When the toggle is switched **on**: fields become editable; user must fill in or detect the Remote Backend URL before schedules can be created

---

## Frontend Changes

### Schedule button — Clone screen

A **Schedule** button appears next to the Clone button, enabled when the form is valid. Opens `ScheduleDialog` pre-populated with current form values.

### Schedule button — Configure screen

Same pattern — Schedule button next to Configure button, enabled when instances are selected.

### ScheduleDialog component

New `frontend/src/components/ScheduleDialog.tsx`:

- **Name** field
- **Cron expression** field with human-readable preview (using `cronstrue` npm package)
- **Timezone** selector (pre-filled with browser timezone)
- **Enabled** toggle
- Read-only summary of job parameters
- **Save Schedule** → `POST /api/schedules`

### Schedules page

New `frontend/src/pages/Schedules.tsx` with two sections:

**Top — Schedule list:**

| Column | Description |
|---|---|
| Name | Schedule name |
| Type | Clone or Configure |
| Schedule | Cron + human-readable form |
| Status | Enabled / Disabled toggle |
| Actions | Edit, Delete, Run now |

**Bottom — Run history** (shown when a schedule is selected):

| Column | Description |
|---|---|
| Started | Timestamp |
| Duration | Time to complete |
| Triggered by | Scheduler or Manual |
| Status | Completed / Failed |
| Actions | View logs |

Log viewer shows the `log_lines` array from Firestore, styled like the existing `LogStream` component.

### Sidebar

New nav item: **Schedules** with `CalendarClock` icon, positioned between SSH Configurations and Images.

---

## GCP Infrastructure Setup (one-time)

### 1. Enable APIs

```bash
gcloud services enable \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project {project_id}
```

### 2. Create Firestore database

```bash
gcloud firestore databases create \
  --location=europe-west1 \
  --project={project_id}
```

### 3. Required IAM roles for service account

| Role | Purpose |
|---|---|
| `roles/compute.instanceAdmin.v1` | Compute Engine (existing) |
| `roles/dns.admin` | Cloud DNS (existing) |
| `roles/datastore.user` | Read/write Firestore |
| `roles/cloudscheduler.admin` | Create/manage scheduler jobs |
| `roles/run.invoker` | Invoke Cloud Run |

### 4. Deploy Cloud Run service

```bash
gcloud run deploy fabricstudio-scheduler \
  --image ghcr.io/4tnetse/fabricstudio-gcp-manager:latest \
  --platform managed \
  --region europe-west1 \
  --no-allow-unauthenticated \
  --service-account {sa_email} \
  --set-env-vars APP_MODE=backend \
  --memory 512Mi \
  --max-instances 3 \
  --project {project_id}
```

### 5. Grant invoker permission to Cloud Scheduler

```bash
gcloud run services add-iam-policy-binding fabricstudio-scheduler \
  --member="serviceAccount:{sa_email}" \
  --role="roles/run.invoker" \
  --region=europe-west1 \
  --project={project_id}
```

---

## New Files

### Backend

```
backend/
├── routers/
│   └── schedules.py          # CRUD + trigger + proxy
├── services/
│   ├── firestore_client.py   # Async Firestore wrapper
│   ├── cloud_scheduler.py    # Cloud Scheduler CRUD
│   └── id_token.py           # ID token generation + caching
└── models/
    └── schedule.py           # Pydantic models
```

### Frontend

```
frontend/src/
├── api/
│   └── schedules.ts          # TanStack Query hooks
├── components/
│   └── ScheduleDialog.tsx    # Create/edit schedule modal
└── pages/
    └── Schedules.tsx         # Schedules list + run history
```

### New Python dependencies

```
google-cloud-firestore==2.19.0
google-cloud-scheduler==2.13.0
```

### New npm dependencies

```
cronstrue  # cron expression to human-readable text
```

---

## Implementation Phases

| Phase | Goal | Key deliverables |
|---|---|---|
| **1** | Backend Firestore CRUD | `schedules.py` router, Firestore client, Pydantic models, no Cloud Scheduler yet |
| **2** | Frontend Schedules screen | Schedule list, ScheduleDialog, Schedule buttons on Clone/Configure, Settings fields |
| **3** | Cloud Run backend mode | `APP_MODE` env var, settings-snapshot injection, key loading from Firestore, Firestore log writing |
| **4** | Cloud Scheduler integration | Create/update/delete Cloud Scheduler jobs on schedule CRUD |
| **5** | Local proxy + ID token auth | Proxy layer in `schedules.py`, ID token service, end-to-end local→Cloud Run test |
| **6** | Job history UI | Run history panel, log viewer, Run now button |
