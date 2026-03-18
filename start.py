#!/usr/bin/env python3
"""
Fabric Studio GCP Manager — Start Script
Starts backend + frontend in the background and returns the terminal.
Works on Windows, macOS, and Linux.

Usage:
  python start.py                                  # default ports 8000 + 5173
  python start.py --backend-port 9000              # custom backend port
  python start.py --frontend-port 3000             # custom frontend port
  python start.py --backend-port 9000 --frontend-port 3000
"""

import argparse
import os
import subprocess
import sys
import platform
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"
PID_FILE = ROOT / ".fabricstudio.pids"

IS_WINDOWS = platform.system() == "Windows"


def error(msg: str):
    print(f"\n  ERROR: {msg}")
    sys.exit(1)


def get_python():
    path = VENV / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")
    if not path.exists():
        error("Virtual environment not found. Run 'python setup.py' first.")
    return str(path)


def get_npm():
    return "npm.cmd" if IS_WINDOWS else "npm"


def main():
    parser = argparse.ArgumentParser(description="Start Fabric Studio GCP Manager")
    parser.add_argument("--backend-port", type=int, default=1981, help="Backend port (default: 1981)")
    parser.add_argument("--frontend-port", type=int, default=1980, help="Frontend port (default: 1980)")
    parser.add_argument("--debug", action="store_true", help="Show backend and frontend output")
    args = parser.parse_args()

    backend_port = args.backend_port
    frontend_port = args.frontend_port

    if PID_FILE.exists():
        print("  WARNING: .fabricstudio.pids already exists — app may already be running.")
        print("  Run 'python stop.py' first if you want to restart.")
        sys.exit(1)

    python = get_python()
    npm = get_npm()

    if not (FRONTEND / "node_modules").exists():
        error("Node modules not found. Run 'python setup.py' first.")

    debug = args.debug
    devnull = None if debug else subprocess.DEVNULL

    print(f"==> Starting backend on port {backend_port} ...")
    if IS_WINDOWS:
        backend_proc = subprocess.Popen(
            [python, "-m", "uvicorn", "main:app", "--port", str(backend_port), "--reload"],
            cwd=str(BACKEND),
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            stdout=devnull, stderr=devnull,
        )
    else:
        backend_proc = subprocess.Popen(
            [python, "-m", "uvicorn", "main:app", "--port", str(backend_port), "--reload"],
            cwd=str(BACKEND),
            start_new_session=True,
            stdout=devnull, stderr=devnull,
        )

    print(f"==> Starting frontend on port {frontend_port} ...")
    env = os.environ.copy()
    env["VITE_PORT"] = str(frontend_port)
    env["VITE_BACKEND_PORT"] = str(backend_port)
    if IS_WINDOWS:
        frontend_proc = subprocess.Popen(
            [npm, "run", "dev", "--", "--port", str(frontend_port)],
            cwd=str(FRONTEND),
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            env=env,
            stdout=devnull, stderr=devnull,
        )
    else:
        frontend_proc = subprocess.Popen(
            [npm, "run", "dev", "--", "--port", str(frontend_port)],
            cwd=str(FRONTEND),
            start_new_session=True,
            env=env,
            stdout=devnull, stderr=devnull,
        )

    # Save PIDs, PGIDs and ports for the stop script
    if IS_WINDOWS:
        PID_FILE.write_text(
            f"backend_port={backend_port}\n"
            f"frontend_port={frontend_port}\n"
            f"pid={backend_proc.pid}\n"
            f"pid={frontend_proc.pid}\n"
        )
    else:
        backend_pgid = os.getpgid(backend_proc.pid)
        frontend_pgid = os.getpgid(frontend_proc.pid)
        PID_FILE.write_text(
            f"backend_port={backend_port}\n"
            f"frontend_port={frontend_port}\n"
            f"pid={backend_proc.pid} pgid={backend_pgid}\n"
            f"pid={frontend_proc.pid} pgid={frontend_pgid}\n"
        )

    print(f"\n  Browse to http://localhost:{frontend_port} to access Fabric Studio GCP Manager.")
    print(f"\n  Run 'python stop.py' to stop the application.")


if __name__ == "__main__":
    main()
