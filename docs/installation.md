# Installation

## Requirements

- Python 3.11 or higher
- Node.js 18 or higher
- One or more GCP service account JSON keys with sufficient permissions (Compute Engine, Cloud DNS, Resource Manager)

## Setup

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

## Starting

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

## Stopping

```bash
python stop.py
```

On **Windows**:

```bat
stop.bat
```

This will cleanly terminate both the backend and frontend processes.
