# Fabric Studio GCP Manager

A web-based management interface for deploying, configuring, and managing Fabric Studio instances on Google Cloud Platform.

---

## Requirements

- Python 3.11 or higher
- Node.js 18 or higher
- One or more GCP service account JSON keys with sufficient permissions (Compute Engine, Cloud DNS, Resource Manager)

---

## Installation

### Option 1: Docker (recommended)

```bash
docker compose up
```

Open your browser at `http://localhost:8080`.

The Docker image is available at:
```
ghcr.io/4tnetse/fabricstudio-gcp-manager:latest
```

Data (settings and service account keys) is persisted in a named Docker volume.

### Option 2: Run from source

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

See the [Configuration](https://4tnetse.github.io/FabricStudio-GCP-Manager/configuration/) section of the documentation.

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
├── docs/              # MkDocs documentation source
├── site/              # Built documentation (served at /manual)
├── Dockerfile         # Multi-stage Docker build
├── docker-compose.yml # Docker Compose configuration
├── setup.py           # Installation script
├── start.py           # Start script
└── stop.py            # Stop script
```

---

## Tech stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router

**Backend:** FastAPI, Uvicorn, Pydantic, AsyncSSH

**GCP:** Compute Engine, Cloud DNS, Cloud Storage, Resource Manager (via `google-cloud-*` Python libraries)
