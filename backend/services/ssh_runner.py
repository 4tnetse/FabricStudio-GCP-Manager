import asyncio
import re
from pathlib import Path

import asyncssh

PROMPT = "# "
CONNECT_TIMEOUT = 15
COMMAND_TIMEOUT = 30
SEP = "=" * 48


def _strip_ansi(text: str) -> str:
    return re.sub(r'\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\r', '', text)


_SLEEP_RE = re.compile(r'^(.*?)\s*;\s*sleep\s+(\d+(?:\.\d+)?)\s*$', re.IGNORECASE)

def _parse_sleep(cmd: str) -> tuple[str, float]:
    """Return (command_without_sleep, sleep_seconds). Sleep is 0 if not specified."""
    m = _SLEEP_RE.match(cmd)
    if m:
        return m.group(1).strip(), float(m.group(2))
    return cmd, 0.0


async def _read_until_prompt(stdout, timeout: float) -> str:
    """Read from stdout until '# ' is seen or timeout expires."""
    buf = ""
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            break
        try:
            chunk = await asyncio.wait_for(stdout.read(4096), timeout=min(remaining, 5.0))
        except asyncio.TimeoutError:
            break
        if not chunk:
            break
        buf += chunk
        if PROMPT in buf:
            break
    return buf


async def _run_on_host(
    host: str,
    commands: list[str],
    username: str,
    ssh_key_path: str | None,
    log_queue: asyncio.Queue | None,
    add_separator: bool = False,
) -> list[str]:
    connect_kwargs: dict = {
        "host": host,
        "username": username,
        "known_hosts": None,
        "server_host_key_algs": ["ssh-rsa", "ecdsa-sha2-nistp256", "ssh-ed25519"],
        "preferred_auth": ["publickey"],
        "connect_timeout": CONNECT_TIMEOUT,
    }
    if ssh_key_path:
        key_path = Path(ssh_key_path)
        if key_path.exists():
            connect_kwargs["client_keys"] = [str(key_path)]

    output_lines: list[str] = []

    async def log(msg: str) -> None:
        output_lines.append(msg)
        if log_queue is not None:
            await log_queue.put(f"[{host}] {msg}")

    if add_separator and log_queue is not None:
        await log_queue.put(SEP)
        await log_queue.put(SEP)

    try:
        async with asyncssh.connect(**connect_kwargs) as conn:
            async with conn.create_process(request_pty=True, term_type="vt100") as proc:

                # Read and log banner
                banner_raw = await _read_until_prompt(proc.stdout, timeout=10)
                if banner_raw:
                    for line in _strip_ansi(banner_raw).split("\n"):
                        if line.strip():
                            await log(line.rstrip())

                # Run each command
                for raw_cmd in commands:
                    cmd, sleep_secs = _parse_sleep(raw_cmd)
                    await log(f">> {cmd}")
                    proc.stdin.write(cmd + "\n")
                    raw = await _read_until_prompt(proc.stdout, timeout=COMMAND_TIMEOUT)
                    if not raw:
                        await log(f"No response to: {cmd}")
                    else:
                        clean = _strip_ansi(raw)
                        for line in clean.split("\n"):
                            stripped = line.strip()
                            # Skip echoed command and prompt line
                            if not stripped or stripped == cmd.strip() or stripped.endswith(" #") or stripped == "#":
                                continue
                            await log(line.rstrip())

                    if sleep_secs > 0:
                        await log(f"Sleeping {sleep_secs:.0f}s...")
                        await asyncio.sleep(sleep_secs)

                try:
                    proc.stdin.write("exit\n")
                except Exception:
                    pass

    except asyncssh.PermissionDenied:
        key_info = f"key: {ssh_key_path}" if ssh_key_path else "no key configured"
        await log(f"Authentication failed ({key_info})")
    except asyncssh.DisconnectError as exc:
        await log(f"Disconnected: {exc}")
    except Exception as exc:
        await log(f"SSH error: {exc}")

    return output_lines


async def _run_on_host_with_timeout(
    host: str,
    commands: list[str],
    username: str,
    ssh_key_path: str | None,
    log_queue: asyncio.Queue | None,
    timeout: float = 60.0,
    add_separator: bool = False,
    separator_after: bool = False,
) -> list[str]:
    result: list[str] = []
    try:
        try:
            result = await asyncio.wait_for(
                _run_on_host(host, commands, username, ssh_key_path, log_queue, add_separator),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            msg = f"Timed out after {int(timeout)}s"
            if log_queue is not None:
                await log_queue.put(f"[{host}] {msg}")
            result = [msg]
        except Exception as exc:
            msg = f"SSH error: {exc}"
            if log_queue is not None:
                await log_queue.put(f"[{host}] {msg}")
            result = [msg]
        return result
    finally:
        if separator_after and log_queue is not None:
            await log_queue.put(SEP)
            await log_queue.put(SEP)


async def run_ssh_commands(
    addresses: list[str],
    commands: list[str],
    username: str = "admin",
    ssh_key_path: str | None = None,
    parallel: bool = True,
    log_queue: asyncio.Queue | None = None,
    timeout: float = 60.0,
) -> dict[str, list[str]]:
    results: dict[str, list[str]] = {}

    if parallel and len(addresses) > 1:
        # Multiple hosts: buffer per host to avoid interleaved output,
        # then flush each host's block as it completes.
        async def _run_and_tag(host: str):
            lines = await _run_on_host_with_timeout(
                host, commands, username, ssh_key_path, None, timeout,
                add_separator=False, separator_after=False,
            )
            return host, lines

        for coro in asyncio.as_completed([_run_and_tag(h) for h in addresses]):
            try:
                host, lines = await coro
            except Exception as exc:
                lines = [f"Unexpected error: {exc}"]
                host = "unknown"
            results[host] = lines
            if log_queue is not None:
                for line in lines:
                    await log_queue.put(f"[{host}] {line}")
                await log_queue.put(SEP)
                await log_queue.put(SEP)
    else:
        # Sequential mode OR single host in parallel mode — stream output live
        for host in addresses:
            results[host] = await _run_on_host_with_timeout(
                host, commands, username, ssh_key_path, log_queue, timeout,
                add_separator=False,
                separator_after=True,
            )

    return results
