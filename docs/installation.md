# Installation

Two installation methods are available: **Docker** (recommended, no dependencies) or **from source** (requires Python and Node.js).

---

## Docker

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose

### Setup

Download the `docker-compose.yml` file from the repository, or create one with the following content:

```yaml
services:
  app:
    image: ghcr.io/4tnetse/fabricstudio-gcp-manager:latest
    ports:
      - "8080:8080"
    volumes:
      - fabricstudio-data:/root/.fabricstudio

volumes:
  fabricstudio-data:
```

### Starting

```bash
docker compose up -d
```

Once started, open your browser at:

```
http://localhost:8080
```

### Stopping

```bash
docker compose down
```

### Updating

```bash
docker compose pull && docker compose up -d
```

> App data (keys, settings, configurations) is stored in the `fabricstudio-data` Docker volume and is preserved across updates.

---

## From source

### Requirements

- Python 3.11 or higher
- Node.js 18 or higher
- One or more GCP service account JSON keys with sufficient permissions (Compute Engine, Cloud DNS, Resource Manager)

**Scheduling (optional):** Remote scheduling requires additional GCP services. See [Scheduling setup](configuration.md#scheduling-setup-optional) in the Configuration guide.

### Setup

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

### Starting

```bash
python start.py
```

On **Windows**:

```bat
start.bat
```

Optional arguments:

| Argument | Default | Description |
|---|---|---|
| `--backend-port` | `1981` | Port for the FastAPI backend |
| `--frontend-port` | `1980` | Port for the React frontend |
| `--debug` | off | Enable backend debug/reload mode |

Once started, open your browser at:

```
http://localhost:1980
```

### Stopping

```bash
python stop.py
```

On **Windows**:

```bat
stop.bat
```

This will cleanly terminate both the backend and frontend processes.
