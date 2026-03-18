#!/usr/bin/env python3
"""
Fabric Studio GCP Manager — Stop Script
Cleanly stops backend + frontend and frees all ports.
Works on Windows, macOS, and Linux.
Usage: python stop.py
"""

import os
import signal
import subprocess
import sys
import platform
from pathlib import Path

ROOT = Path(__file__).parent
PID_FILE = ROOT / ".fabricstudio.pids"

IS_WINDOWS = platform.system() == "Windows"


def kill_by_port(port: int):
    """Kill any process still holding the given port."""
    try:
        if IS_WINDOWS:
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    pid = int(line.strip().split()[-1])
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        else:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True, text=True
            )
            for pid_str in result.stdout.strip().splitlines():
                try:
                    os.kill(int(pid_str), signal.SIGKILL)
                except ProcessLookupError:
                    pass
    except Exception:
        pass


def parse_pid_file():
    """Parse .fabricstudio.pids and return (ports, process_lines)."""
    lines = PID_FILE.read_text().strip().splitlines()
    ports = []
    proc_lines = []
    for line in lines:
        if line.startswith("backend_port=") or line.startswith("frontend_port="):
            ports.append(int(line.split("=")[1]))
        else:
            proc_lines.append(line)
    return ports, proc_lines


def main():
    if not PID_FILE.exists():
        print("  No .fabricstudio.pids file found — trying port cleanup on defaults 1980 and 1981...")
        kill_by_port(1980)
        kill_by_port(1981)
        print("  Done.")
        return

    ports, proc_lines = parse_pid_file()

    for line in proc_lines:
        try:
            if IS_WINDOWS:
                pid = int(line.strip().split("=")[1])
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True
                )
                print(f"  Stopped PID {pid}")
            else:
                parts = dict(p.split("=") for p in line.split())
                pgid = int(parts["pgid"])
                try:
                    os.killpg(pgid, signal.SIGTERM)
                    print(f"  Stopped process group {pgid}")
                except ProcessLookupError:
                    pass
        except Exception as e:
            print(f"  Warning: could not stop process from '{line}': {e}")

    PID_FILE.unlink(missing_ok=True)

    # Final cleanup — kill anything still holding the ports
    for port in ports:
        kill_by_port(port)
        print(f"  Port {port} freed.")

    print("\n  Fabric Studio GCP Manager stopped.")


if __name__ == "__main__":
    main()
