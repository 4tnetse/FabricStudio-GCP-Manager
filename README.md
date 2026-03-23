# Fabric Studio GCP Manager

A web-based management interface for deploying, configuring, and managing Fabric Studio instances on Google Cloud Platform.

---

## Features

| Screen | Description |
|---|---|
| **Instances** | List all GCP instances with filtering by status, purpose label, and name search. Bulk start, stop and delete. Click an instance for full details: zone, machine type, vCPUs, memory, boot disk, IPs, labels, and estimated hourly cost. |
| **Clone** | Bulk-clone a golden image to multiple instances with custom naming, destination zone selection, and batch processing. |
| **SSH** | Execute commands across multiple instances simultaneously with live streaming output. Supports configuration file-based execution. |
| **Configurations** | Create and edit `.conf` files containing Fabric Studio CLI commands for reuse in the SSH screen. |
| **Costs** | View billing account information and current-month cost summary for the active GCP project. |
| **Labels** | Add and remove GCP labels on any instance. |
| **Firewall** | View and manage GCP firewall rules. |
| **Images** | Browse available VM machine images. |
| **Build** | Build new Fabric Studio instances from scratch. |
| **Settings** | Configure your GCP service account key, SSH public key, DNS settings, default zone, and more. |

---

## Requirements

- Python 3.11 or higher
- Node.js 18 or higher
- A GCP service account JSON key with sufficient permissions (Compute Engine, Cloud DNS, Resource Manager)

---

## Installation

Clone the repository and run the setup script once:

```bash
git clone https://github.com/4tnetse/FabricStudio-GCP-Manager.git
cd FabricStudio-GCP-Manager
python setup.py
```

On **Windows**, use the batch wrapper:
```bat
setup.bat
```

The setup script will:
1. Verify Python and Node.js versions
2. Create a Python virtual environment in `backend/.venv`
3. Install Python dependencies
4. Install Node.js dependencies in `frontend/`

---

## Starting

```bash
python start.py
```

On **Windows**:
```bat
start.bat
```

Optional arguments:
```
--backend-port   Port for the FastAPI backend  (default: 1981)
--frontend-port  Port for the React frontend   (default: 1980)
--debug          Enable backend debug/reload mode
```

Once started, open your browser at:
```
http://localhost:1980
```

---

## Stopping

```bash
python stop.py
```

On **Windows**:
```bat
stop.bat
```

This will cleanly terminate both the backend and frontend processes.

---

## First-time configuration

On first launch, go to **Settings** and configure:

1. **Service account key** — Upload your GCP service account JSON key file. This is required before any GCP operations will work.
2. **GCP Project** — Select the active project from the sidebar project selector after the key is loaded.
3. **SSH public key** — Paste your public key to enable SSH command execution on instances. This public SSH key should be installed on your golden image or any instance you want to access.
4. **Default zone** — Set your preferred GCP zone (e.g. `europe-west4-a`).
5. **DNS settings** *(optional)* — DNS domain, FQDN prefix, and Cloud DNS zone name for automatic DNS record creation during cloning.
6. **License server** *(optional)* — IP of your Fabric Studio license server.

Settings are stored in `~/.fabricstudio/settings.json`.

---

## Configuration files

Configuration files (`.conf`) contain Fabric Studio CLI commands that can be executed via SSH across multiple instances. They are stored in the `conf/` directory. An example is included at `conf/example.conf`.

You can create and edit configuration files directly in the **Configurations** screen.

---

## Project structure

```
FabricStudio-GCP-Manager/
├── frontend/          # React + TypeScript + Vite frontend
│   └── src/
│       ├── pages/     # One file per screen
│       ├── api/       # API client hooks (TanStack Query)
│       └── components/
├── backend/           # FastAPI Python backend
│   ├── routers/       # API endpoints
│   ├── services/      # GCP, SSH, and DNS logic
│   └── models/        # Pydantic data models
├── conf/              # CLI command configuration templates
├── setup.py           # Installation script
├── start.py           # Start script
└── stop.py            # Stop script
```

---

## Tech stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router

**Backend:** FastAPI, Uvicorn, Pydantic, AsyncSSH

**GCP:** Compute Engine, Cloud DNS, Cloud Storage, Resource Manager (via `google-cloud-*` Python libraries)