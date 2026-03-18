#!/usr/bin/env python3
"""
Fabric Studio GCP Manager — Setup Script
Works on Windows, macOS, and Linux.
Usage: python setup.py
"""

import subprocess
import sys
import platform
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"


def title(msg: str):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")


def step(msg: str):
    print(f"\n==> {msg}")


def success(msg: str):
    print(f"  ✓ {msg}")


def error(msg: str):
    print(f"\n  ERROR: {msg}")
    sys.exit(1)


def check_python():
    step("Checking Python version...")
    v = sys.version_info
    if v < (3, 11):
        error(f"Python 3.11+ required, found {v.major}.{v.minor}. Please upgrade.")
    success(f"Python {v.major}.{v.minor}.{v.micro}")


def check_node():
    step("Checking Node.js version...")
    node = shutil.which("node")
    if not node:
        error("Node.js not found. Install Node 18+ from https://nodejs.org")
    result = subprocess.run(["node", "--version"], capture_output=True, text=True)
    version_str = result.stdout.strip().lstrip("v")
    major = int(version_str.split(".")[0])
    if major < 18:
        error(f"Node 18+ required, found v{version_str}. Please upgrade.")
    success(f"Node v{version_str}")


def check_npm():
    step("Checking npm...")
    npm = shutil.which("npm")
    if not npm:
        error("npm not found. It should come with Node.js.")
    result = subprocess.run(["npm", "--version"], capture_output=True, text=True)
    success(f"npm v{result.stdout.strip()}")


def create_venv():
    step("Creating Python virtual environment in backend/.venv ...")
    if VENV.exists():
        success("Already exists, skipping.")
        return
    subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    success("Virtual environment created.")


def install_python_deps():
    step("Installing Python dependencies...")
    pip = VENV / ("Scripts/pip.exe" if platform.system() == "Windows" else "bin/pip")
    subprocess.run([str(pip), "install", "-r", str(BACKEND / "requirements.txt")], check=True)
    success("Python dependencies installed.")


def install_node_deps():
    step("Installing Node dependencies...")
    npm = "npm.cmd" if platform.system() == "Windows" else "npm"
    subprocess.run([npm, "install"], cwd=str(FRONTEND), check=True)
    success("Node dependencies installed.")


def print_next_steps():
    is_windows = platform.system() == "Windows"
    title("Setup complete!")
    print("\nTo start the application:\n")
    if is_windows:
        print("  python start.py")
        print("  — or —")
        print("  start.bat")
    else:
        print("  python start.py")
        print("  — or —")
        print("  ./start.sh")
    print("\nThen open http://localhost:5173 in your browser.")
    print("\nFirst time? Go to Settings to upload your GCP service account key.")


if __name__ == "__main__":
    title("Fabric Studio GCP Manager — Setup")
    print(f"  Platform : {platform.system()} {platform.machine()}")
    print(f"  Directory: {ROOT}")

    check_python()
    check_node()
    check_npm()
    create_venv()
    install_python_deps()
    install_node_deps()
    print_next_steps()
