# Application Design — Technical Reference

**Status:** Living document

---

## Overview

Fabric Studio GCP Manager is a full-stack web application for deploying, configuring, and managing Fabric Studio instances on Google Cloud Platform. The frontend is a React SPA; the backend is a FastAPI Python app that proxies GCP API calls using service account credentials.

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│                   LOCAL MACHINE                     │
│                                                     │
│  Browser (port 1980)                                │
│  ┌──────────────────┐  HTTP   ┌──────────────────┐  │
│  │ React + Vite     │────────▶│ FastAPI          │  │
│  │ TanStack Query   │         │ port 1981        │  │
│  │ React Router     │◀────────│ uvicorn          │  │
│  └──────────────────┘   SSE   └────────┬─────────┘  │
│                                        │             │
└────────────────────────────────────────┼─────────────┘
                                         │ HTTPS
                                         ▼
                              ┌──────────────────────┐
                              │   GCP APIs           │
                              │  Compute Engine      │
                              │  Cloud DNS           │
                              │  Cloud Billing       │
                              │  Resource Manager    │
                              └──────────────────────┘
```

In development, Vite proxies `/api` to the backend. In Docker mode, the built frontend is served as a SPA fallback from the backend itself.

---

## Project Structure

```
fabricstudio-ui/
├── backend/
│   ├── main.py              # App entry point, lifespan, static serving
│   ├── config.py            # AppSettings, load/save functions
│   ├── auth.py              # get_credentials() — returns GCP credentials
│   ├── models/
│   │   ├── settings.py      # SettingsUpdate Pydantic model
│   │   ├── instance.py      # Instance, BuildConfig, CloneRequest, ConfigureRequest, …
│   │   ├── firewall.py      # FirewallRule, IpAclRequest, TagRequest, …
│   │   └── schedule.py      # Schedule, ScheduleCreate, ScheduleUpdate, JobRun
│   ├── routers/             # One file per feature area
│   │   ├── settings.py      # /api/settings, /api/settings/keys
│   │   ├── projects.py      # /api/projects
│   │   ├── instances.py     # /api/instances
│   │   ├── operations.py    # /api/ops (build, clone, configure, bulk)
│   │   ├── firewall.py      # /api/firewall
│   │   ├── labels.py        # /api/instances/{zone}/{name}/labels
│   │   ├── tags.py          # /api/instances/{zone}/{name}/tags
│   │   ├── ssh.py           # /api/ssh
│   │   ├── images.py        # /api/images
│   │   ├── configs.py       # /api/configs
│   │   ├── costs.py         # /api/costs
│   │   ├── cloud_run.py     # /api/cloud-run — deploy/undeploy Cloud Run scheduling backend
│   │   └── schedules.py     # /api/schedules — CRUD, trigger, run history, proxy layer
│   └── services/
│       ├── gcp_compute.py   # GCPComputeService — all Compute Engine operations
│       ├── gcp_dns.py       # GCPDnsService — A record management
│       ├── gcp_billing.py   # GCPBillingService — pricing and billing info
│       ├── fs_api.py        # FabricStudioClient — Fabric Studio HTTP API
│       ├── key_store.py     # KeyStoreService — multi-key management
│       ├── ssh_runner.py    # SSHRunner — asyncssh-based SSH execution
│       ├── parallel_runner.py # JobManager — SSE job queue
│       ├── instance_naming.py # InstanceName — naming convention
│       ├── dns_helpers.py   # create/delete DNS A records for instances
│       ├── firestore_client.py # Async Firestore wrapper (schedules + job_runs)
│       ├── cloud_scheduler.py  # Cloud Scheduler job management
│       ├── schedule_runner.py  # Executes triggered schedule jobs, writes logs
│       └── id_token.py      # ID token generation for local → Cloud Run auth
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Router, sidebar, nav
│   │   ├── pages/           # One file per page
│   │   ├── components/      # Reusable components
│   │   ├── api/             # TanStack Query hooks
│   │   ├── hooks/           # useSSEStream, useDeployStream
│   │   ├── context/         # ThemeContext, BuildContext, ImportContext, OpsContext
│   │   └── lib/             # types.ts, utils.ts, zones.ts
│   └── dist/                # Built output (Docker / production)
├── conf/                    # SSH configuration files (*.conf)
├── docs/                    # MkDocs source
└── site/                    # Built documentation (served at /manual)
```

---

## Settings

### Storage

Settings are stored in `~/.fabricstudio/settings.json`. The file is read at startup and written on every change.

### AppSettings fields

| Field | Type | Default | Description |
|---|---|---|---|
| `active_key_id` | str \| None | `None` | ID of the currently selected service account key |
| `active_project_id` | str \| None | `None` | Currently selected GCP project ID |
| `initials` | str | `""` | Workshop ID / prepend (e.g., `tve`) |
| `default_zone` | str | `"europe-west4-a"` | Default GCP zone for new instances |
| `default_type` | str | `"fs"` | Instance type prefix |
| `owner` | str | `""` | Owner label applied to built instances |
| `group` | str | `""` | Group label applied to built instances |
| `ssh_public_key` | str | `""` | SSH public key or path for SSH operations |
| `dns_domain` | str | `""` | DNS domain (e.g., `fs.fortilab.be`) |
| `instance_fqdn_prefix` | str | `""` | FQDN prefix before the instance number (e.g., `lab`) |
| `dns_zone_name` | str | `""` | Cloud DNS managed zone name |
| `fs_admin_password` | str | `""` | Default admin password for Fabric Studio API operations |
| `teams_webhook_url` | str \| None | `None` | Microsoft Teams Power Automate webhook URL for job notifications |
| `remote_scheduling_enabled` | bool | `False` | Enable remote scheduling via Cloud Run + Cloud Scheduler |
| `remote_backend_url` | str | `""` | HTTPS URL of the `fabricstudio-scheduler` Cloud Run service |
| `cloud_run_region` | str | `"europe-west1"` | GCP region of the scheduler Cloud Run service |
| `firestore_project_id` | str | `""` | GCP project hosting Firestore (defaults to active project) |

**Validation:**

- `dns_domain`: must match `^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$`
- `instance_fqdn_prefix`: must match `^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?$`

---

## Service Account Keys

### Key Store

Multiple GCP service account keys are supported. Keys are stored in `~/.fabricstudio/keys/`:

```
~/.fabricstudio/
├── settings.json
└── keys/
    ├── metadata.json          # Array of KeyMeta objects
    ├── {key_id}.json          # Service account JSON key (permissions: 600)
    └── …
```

### KeyMeta model

```python
class KeyMeta(BaseModel):
    id: str                     # UUID
    display_name: str           # User-visible label
    filename: str               # Original uploaded filename
    client_email: str           # Service account email
    projects: list[ProjectInfo] # Accessible GCP projects
```

### Upload flow

1. User uploads JSON key file via `POST /api/settings/keys`
2. `KeyStoreService.add_key()` probes GCP (`ProjectsClient.search_projects()`) to enumerate accessible projects
3. Key saved to `~/.fabricstudio/keys/{key_id}.json` (600 permissions)
4. Metadata appended to `metadata.json`
5. Frontend invalidates keys + projects queries

### Authentication

`auth.get_credentials()` is called in every router that talks to GCP:

1. Checks `active_key_id` → loads key from key store
2. Falls back to legacy `service_account_key_path`
3. Raises `HTTP 400` if no key is available
4. Returns `service_account.Credentials` with scope `https://www.googleapis.com/auth/cloud-platform`

---

## Instance Naming Convention

**Format:** `{type}-{prepend}-{product}-{number}`

| Segment | Example | Description |
|---|---|---|
| `type` | `fs` | Fixed prefix (default "fs") |
| `prepend` | `tve` | Workshop ID / initials |
| `product` | `fwb` | Product or course code |
| `number` | `001` | 3-digit zero-padded integer |

**Examples:**

- `fs-tve-fwb-001` — participant instance #1
- `fs-tve-fwb-000` — golden image (template for cloning)
- `fs-tve-tve-advanced-003` — product with dashes

**FQDN format:** `{prefix}{number}.{product}.{domain}`
→ `lab001.fwb.fs.fortilab.be`

The `InstanceName` dataclass in `services/instance_naming.py` parses and constructs these names. It is the authoritative implementation.

---

## API Endpoints

All endpoints are under the `/api` prefix.

### Settings — `/api/settings`

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | Get all settings + `has_keys` flag |
| PUT | `/settings` | Update settings (partial) |
| DELETE | `/settings` | Reset to defaults |
| GET | `/settings/keys` | List all stored keys |
| POST | `/settings/keys` | Upload new key (multipart form) |
| DELETE | `/settings/keys/{key_id}` | Delete key |
| PATCH | `/settings/keys/{key_id}` | Rename key (`{display_name}`) |

### Projects — `/api/projects`

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List all projects across all keys |
| POST | `/projects/select` | Set active project (`{project_id}`) |

### Instances — `/api/instances`

| Method | Path | Description |
|---|---|---|
| GET | `/instances` | List instances (filters: `zone`, `product`, `status`, `prepend`) |
| GET | `/instances/zones` | List available GCP zones |
| GET | `/instances/zone-locations` | Get zone → location mapping (cached JSON) |
| GET | `/instances/machine-types?zone=` | List machine types in a zone |
| GET | `/instances/public-ips` | List running instances with public IPs |
| GET | `/instances/{zone}/{name}` | Get single instance |
| POST | `/instances/{zone}/{name}/start` | Start instance + create DNS |
| POST | `/instances/{zone}/{name}/stop` | Stop instance + delete DNS |
| DELETE | `/instances/{zone}/{name}` | Delete instance + delete DNS |
| PATCH | `/instances/{zone}/{name}/machine-type` | Change machine type |
| PATCH | `/instances/{zone}/{name}/rename` | Rename instance |
| POST | `/instances/{zone}/{name}/move` | Move to another zone |

### Labels & Tags

| Method | Path | Description |
|---|---|---|
| GET | `/instances/{zone}/{name}/labels` | Get labels |
| POST | `/instances/{zone}/{name}/labels` | Add label (`{key, value}`) |
| DELETE | `/instances/{zone}/{name}/labels/{key}` | Remove label |
| GET | `/instances/{zone}/{name}/tags` | Get tags |
| POST | `/instances/{zone}/{name}/tags` | Add tag (`{tag}`) |
| DELETE | `/instances/{zone}/{name}/tags/{tag}` | Remove tag |
| PUT | `/instances/{zone}/{name}/tags` | Replace tag (`{old_tag, new_tag}`) |

### Operations — `/api/ops`

All operations return `{job_id}` and stream output as SSE.

| Method | Path | Description |
|---|---|---|
| POST | `/ops/build` | Build N instances from image |
| POST | `/ops/clone` | Clone from golden image |
| POST | `/ops/configure` | Configure single instance via FS API |
| POST | `/ops/bulk-configure` | Bulk configure multiple instances |
| POST | `/ops/bulk-start` | Bulk start instances |
| POST | `/ops/bulk-stop` | Bulk stop instances |
| POST | `/ops/bulk-delete` | Bulk delete instances |
| POST | `/ops/bulk-shutdown` | Graceful shutdown via FS API |
| GET | `/ops/fs-templates?instance_name=` | Fetch fabric templates from instance |
| GET | `/ops/{job_id}/stream` | SSE stream of job output |
| GET | `/ops/{job_id}/status` | Job status (`running`/`completed`/`failed`) |

### SSH — `/api/ssh`

| Method | Path | Description |
|---|---|---|
| POST | `/ssh/execute` | Execute commands (`{addresses, commands, config_name?, parallel}`) |
| POST | `/ssh/test` | Test connectivity |
| GET | `/ssh/{job_id}/stream` | SSE output stream |

### Firewall — `/api/firewall`

| Method | Path | Description |
|---|---|---|
| GET | `/firewall/acl` | Get source IP allowlist rule |
| POST | `/firewall/acl/add` | Add IP to allowlist (auto-detect if no body) |
| DELETE | `/firewall/acl/remove` | Remove IP (`{ip_address}`) |
| GET | `/firewall/global-access` | Get global access rule status |
| POST | `/firewall/global-access` | Enable/disable global access (`{enabled}`) |
| GET | `/firewall/rules` | List all firewall rules |

### Cloud Run — `/api/cloud-run`

| Method | Path | Description |
|---|---|---|
| GET | `/cloud-run/permissions` | Check IAM permissions required for deploy |
| GET | `/cloud-run/subnets?region=` | List VPC subnets in a region |
| POST | `/cloud-run/deploy` | Start deploy job — returns `{deploy_id}` |
| GET | `/cloud-run/deploy/{deploy_id}/stream` | SSE log stream for deploy job |
| POST | `/cloud-run/undeploy` | Start undeploy job — returns `{undeploy_id}` |
| GET | `/cloud-run/undeploy/{undeploy_id}/stream` | SSE log stream for undeploy job |

### Version — `/api/version`

| Method | Path | Description |
|---|---|---|
| GET | `/version` | Local version + remote Cloud Run version + upgrade availability |
| POST | `/version/upgrade-remote` | Start remote upgrade job — returns `{upgrade_id}` |
| GET | `/version/upgrade-remote/{upgrade_id}/stream` | SSE log stream for upgrade job |

### Other

| Method | Path | Description |
|---|---|---|
| GET | `/images` | List custom images in project |
| GET | `/configs` | List config files |
| GET | `/configs/{name}` | Get config file content + parsed key=value pairs |
| POST | `/configs` | Create config file |
| PUT | `/configs/{name}` | Update config file |
| DELETE | `/configs/{name}` | Delete config file |
| GET | `/costs/machine-type-price?machine_type=&zone=` | Hourly price for machine type |
| GET | `/costs/summary` | Billing account info |
| GET | `/health` | Health check + version + active project |

---

## Data Models

### Instance

```python
class Instance(BaseModel):
    name: str
    zone: str
    status: InstanceStatus          # RUNNING | TERMINATED | STAGING | …
    machine_type: str
    public_ip: str | None
    internal_ip: str | None
    labels: dict[str, str]
    tags: list[str]
    creation_timestamp: str | None
    boot_disk_gb: int | None
```

### BuildConfig

```python
class BuildConfig(BaseModel):
    prepend: str
    product: str
    zone: str
    machine_type: str = "n1-standard-4"
    image: str
    trial_key: str = ""
    group: str = ""
    poc_definitions: list[str] = []   # up to 8 fabric workspace definitions
    poc_launch: str = ""
    labels: dict[str, str] = {}
    count_start: int = 0
    count_end: int = 0
    title: str = ""
```

### CloneRequest

```python
class CloneRequest(BaseModel):
    source_name: str
    zone: str
    target_zone: str | None = None
    clone_base_name: str | None = None
    purpose: str | None = None
    count_start: int = 1
    count_end: int = 1
    overwrite: bool = False
```

### BulkConfigureRequest

```python
class BulkConfigureRequest(BaseModel):
    instances: list[BulkConfigureItem]      # [{zone, name}]
    old_admin_password: str = ""
    admin_password: str = ""
    guest_password: str = ""
    trial_key: str = ""
    license_server: str = ""
    poc_launch: str = ""
    poc_definitions: list[str] = []
    ssh_keys: list[str] = []
    delete_existing_keys: bool = False
    hostname_template: str = ""             # supports {count} placeholder
    delete_all_workspaces: bool = False
    workspace_fabrics: list[dict] = []      # [{name, template_id, install}]
```

---

## Backend Services

### GCPComputeService

Wraps all Compute Engine API calls. Instantiated per-request using the active credentials.

Key methods:

```python
async list_instances(zone, filter_str) -> list[Instance]
async get_instance(zone, name) -> Instance
async start_instance(zone, name)
async stop_instance(zone, name)
async delete_instance(zone, name)               # honours delete=no label
async wait_until_deleted(zone, name, interval, max_attempts)
async set_machine_type(zone, name, machine_type)
async rename_instance(zone, name, new_name)
async move_instance(zone, name, destination_zone)   # via machine image
async add_labels(zone, name, labels)
async remove_labels(zone, name, label_keys)
async add_tags(zone, name, tags)
async remove_tags(zone, name, tags)
async list_firewall_rules() -> list[FirewallRule]
async get_firewall_rule(name) -> FirewallRule
async update_firewall_source_ranges(rule_name, source_ranges)
async set_firewall_disabled(rule_name, disabled)
async list_images() -> list[dict]
async list_zones() -> list[str]
async list_machine_types(zone) -> list[str]
async get_machine_type_specs(zone, machine_type) -> dict  # {vcpus, memory_gib}
async get_subnetwork_for_zone(zone) -> str
async create_machine_image(name, source_instance, source_zone)
async delete_machine_image(name)
async create_instance_from_machine_image(name, machine_image, zone)
async build_instance(...)
```

### FabricStudioClient

Async context manager for the Fabric Studio HTTP REST API. Handles CSRF token management, login/logout.

```python
async with FabricStudioClient(fqdn, password) as fs:
    await fs.change_admin_password(current, new)
    await fs.register_token(token_secret)        # "token:secret" format
    await fs.set_license_server(ip)
    await fs.change_user_password(username, new_password)
    await fs.list_templates() -> list[dict]
    await fs.uninstall_fabric()
    await fs.delete_all_fabrics()
    await fs.create_fabric(name, template_id)
    await fs.get_fabric_id_by_name(name) -> int
    await fs.install_fabric(fabric_id)
    await fs.wait_for_tasks(timeout, interval)   # polls /api/v1/task
    await fs.shutdown()
```

**Session flow:**
1. GET `/api/v1/session/check` — extract CSRF token
2. POST `/api/v1/session/open` — login with credentials + CSRF token
3. All subsequent calls include session cookie + rotated CSRF token
4. POST `/api/v1/session/close` — logout on `__aexit__`

**Readiness polling:** `wait_until_ready(fqdn, log, timeout=300, interval=10)` polls `/api/v1/session/check` until HTTP 200.

### JobManager

Manages long-running async jobs and SSE streaming. Lives as a module-level singleton (`parallel_runner.job_manager`).

```python
job_manager.create_job(job_id) -> asyncio.Queue
async job_manager.stream_job(job_id) -> AsyncGenerator[str, None]
async job_manager.mark_done(job_id, failed=False)
job_manager.status: dict[str, str]  # "running" | "completed" | "failed"
```

- Queue messages are plain strings. Sentinels: `__DONE__`, `__FAILED__`
- SSE format: `data: {line}\n\n`

### SSHRunner

Uses `asyncssh` with PTY emulation.

```python
async run_ssh_commands(
    addresses: list[str],
    commands: list[str],
    parallel: bool,
    ssh_key_path: str | None,
    log_queue: asyncio.Queue
)
```

- Connects with `known_hosts=None`, `request_pty=True`, `term_type="vt100"`
- Reads banner output until `# ` prompt before sending commands
- Supports `sleep N` in command list: pauses N seconds between commands
- Strips ANSI escape codes from all output
- Connect timeout: 15s, command timeout: 30s

### GCPDnsService

```python
async upsert_a_record(zone_name, fqdn, public_ip, ttl=300)
async delete_a_record(zone_name, fqdn)
```

### GCPBillingService

```python
async get_project_billing_info() -> dict
async get_billing_account_display_name(billing_account_id) -> str
async get_hourly_price(machine_type, zone, vcpus, memory_gib) -> dict | None
# Returns: {price_usd: float, source: "catalog" | "fallback"}
```

---

## Long-Running Operations — SSE Pattern

All build / clone / configure / SSH operations use the same pattern:

1. **POST** to start operation → returns `{"job_id": "..."}`
2. Frontend opens `EventSource` at `/api/ops/{job_id}/stream` (or `/api/ssh/{job_id}/stream`)
3. Backend queues log lines: `await queue.put("message")`
4. On completion: `await job_manager.mark_done(job_id)` or `mark_done(job_id, failed=True)`
5. Stream yields `__DONE__` or `__FAILED__` sentinel → frontend closes the EventSource

The `LogStream` component handles this pattern on the frontend side.

---

## Build Flow

1. Parse `BuildConfig`
2. Auto-detect subnetwork for the selected zone
3. Merge labels: user labels + `group`, `owner`, `title`, `purpose=golden_image`, `expire` date
4. Create N instances in parallel using `build_instance()`
5. Apply network tags: `workshop-source-any`, `workshop-source-networks`
6. Create DNS A records if `dns_domain` and `dns_zone_name` are configured
7. Stream progress via SSE

---

## Clone Flow

1. Parse source instance name → extract base name via `InstanceName.parse()`
2. For each target number: check if instance already exists (skip if `delete=no` label, or overwrite if `overwrite=True`)
3. Create machine image from source (batched, 5 at a time)
4. Create target instances from machine image in destination zone
5. Apply labels: `delete=yes`, `purpose` if provided
6. Create DNS A records
7. Delete temporary machine image

---

## Configure Flow (single instance)

1. Build FQDN for instance (golden image uses number=0)
2. Poll `wait_until_ready()` — retries every 10s up to 5 minutes
3. Open `FabricStudioClient` session
4. Apply in order:
   - License server (if provided)
   - Registration token (if provided)
   - Admin password change (if provided)
   - SSH keys: add/delete existing keys
   - Hostname (if template provided, `{count}` → instance number)
   - Delete all workspaces (if requested)
   - Create + install workspace fabrics (sequential, wait for tasks)
5. Stream progress via SSE

---

## Frontend Architecture

### Framework

| Library | Purpose |
|---|---|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool + dev server |
| TanStack Query | Server state, caching, refetching |
| React Router | Client-side routing |
| Tailwind CSS | Styling |
| Lucide React | Icons |
| Axios | HTTP client |

### Pages

| File | Route | Page |
|---|---|---|
| `Dashboard.tsx` | `/` | Instance list with filters and bulk operations |
| `Build.tsx` | `/build` | Build new instances from a GCP image |
| `Clone.tsx` | `/clone` | Clone from golden image (cross-zone supported) |
| `Configure.tsx` | `/configure` | Bulk configure instances via Fabric Studio API |
| `Firewall.tsx` | `/firewall` | Source IP allowlist, global access, rule list |
| `Labels.tsx` | `/labels` | Add/remove labels on instances |
| `SSH.tsx` | `/ssh` | Execute SSH commands on instances |
| `Configurations.tsx` | `/configurations` | Edit SSH command config files (`conf/*.conf`) |
| `Schedules.tsx` | `/schedules` | Schedule list and run history |
| `Images.tsx` | `/images` | List custom GCP images |
| `Costs.tsx` | `/costs` | Billing account info and machine type pricing |
| `Settings.tsx` | `/settings` | Keys, preferences, DNS, scheduling, notifications |

### Key Components

| Component | Description |
|---|---|
| `InstanceTable.tsx` | Reusable table for listing and selecting instances |
| `LogStream.tsx` | SSE streaming output panel with status badges |
| `ProjectSelector.tsx` | Project picker in the header bar |
| `CustomSelect.tsx` | Searchable dropdown used across forms |
| `StatusBadge.tsx` | Color-coded instance status pill |
| `SwitchProjectDialog.tsx` | Modal for confirming project switch on key upload |

### API Hooks

All hooks are in `src/api/`. Each file exports TanStack Query hooks.

```typescript
// Pattern for read hooks
const { data, isLoading, error } = useInstances(filters)

// Pattern for mutation hooks
const { mutate, isPending } = useStartInstance()
mutate({ zone, name })
```

The base client in `src/api/client.ts` provides:

```typescript
apiGet<T>(url, params?) -> Promise<T>
apiPost<T>(url, data?) -> Promise<T>
apiPut<T>(url, data?) -> Promise<T>
apiPatch<T>(url, data?) -> Promise<T>
apiDelete<T>(url, data?) -> Promise<T>
```

### SSE Hooks

`useSSEStream(url: string | null)` in `src/hooks/`:

- Opens an `EventSource` when url is non-null
- Accumulates lines into a `string[]` state
- Closes on `__DONE__` or `__FAILED__` sentinel
- Returns `{ lines, isStreaming, error }`

`useDeployStream(url: string | null, onUrl: (url: string) => void)` in `src/hooks/`:

- Same as `useSSEStream` but also intercepts `__URL:<value>` sentinel lines and calls `onUrl` with the extracted URL (used to capture the deployed Cloud Run URL)
- Tracks `failed` separately as a boolean
- Returns `{ lines, isStreaming, failed, error }`

### Theme

`ThemeContext` provides a `theme` value: `"dark"`, `"light"`, or `"security-fabric"`. The `isSF` boolean is derived from `theme === "security-fabric"` and used in components for Fortinet-style conditional Tailwind classes.

### Context Providers

| Context | Purpose |
|---|---|
| `ThemeContext` | App-wide theme (`dark`, `light`, `security-fabric`) |
| `BuildContext` | State for the background build job (stream URL, phase) |
| `ImportContext` | State for the background image import job |
| `OpsContext` | State for background clone, configure, SSH, deploy, and undeploy jobs; exposes stream URLs, job phases, and `useDeployStream` results |

---

## Static File Serving

In Docker / production mode (`frontend/dist` exists):

```
GET /manual          → redirect to /manual/
GET /manual/*        → serve from site/ (MkDocs built output)
GET /{anything}      → serve frontend/dist/{path} or fallback to index.html
GET /api/*           → not intercepted (handled by routers)
```

In development mode, Vite proxies `/api` and `/manual` to the backend (port 1981).

---

## Background Tasks

One background task runs at startup (full mode only):

- **`_daily_price_refresh()`** — refreshes the GCP SKU pricing cache every 24 hours for fallback machine type pricing in the Costs page.

---

## Firewall Rules

The app manages two named firewall rules:

| Rule name | Purpose |
|---|---|
| `workshop-source-networks` | Source IP allowlist — only specific IPs can access instances |
| `workshop-source-any` | Global access — allows all IPs (0.0.0.0/0) when enabled |

Both rules use network tag `workshop-source-networks` as the target. Instances are tagged with both `workshop-source-any` and `workshop-source-networks` at build time.

---

## Configuration Files (conf/)

`.conf` files contain Fabric Studio CLI commands, one per line. Blank lines and `#` comments are ignored. They are used in the SSH page to run pre-defined command sets across multiple instances.

Key=value pairs on each line are parsed and displayed in the Configurations page for preview.

The file `example.conf` is protected from deletion.
