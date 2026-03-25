"""Fabric Studio REST API client."""
import asyncio

import httpx


async def wait_until_ready(
    fqdn: str,
    log,
    timeout: int = 300,
    interval: int = 10,
) -> None:
    """Poll /api/v1/session/check until it returns 200 or timeout is reached.

    Raises TimeoutError if the instance does not become ready in time.
    """
    url = f"https://{fqdn}/api/v1/session/check"
    max_attempts = timeout // interval
    async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
        for attempt in range(1, max_attempts + 1):
            try:
                r = await client.get(url, timeout=5)
                if r.status_code == 200:
                    await log(f"Instance is ready (attempt {attempt}/{max_attempts})")
                    return
            except Exception:
                pass
            await log(f"Waiting for instance to be ready… (attempt {attempt}/{max_attempts})")
            await asyncio.sleep(interval)
    raise TimeoutError(f"Instance at {fqdn} did not become ready within {timeout}s")


class FabricStudioClient:
    """
    Async context manager that opens a session on enter and closes it on exit.

    Usage::

        async with FabricStudioClient(fqdn, password) as client:
            await client.change_admin_password(current, new)
    """

    def __init__(self, fqdn: str, password: str, username: str = "admin"):
        self._base = f"https://{fqdn}"
        self._username = username
        self._password = password
        self._client: httpx.AsyncClient | None = None
        self._csrf: str = ""

    async def __aenter__(self) -> "FabricStudioClient":
        self._client = httpx.AsyncClient(verify=False, follow_redirects=True)
        await self._login()
        return self

    async def __aexit__(self, *_) -> None:
        try:
            await self._logout()
        finally:
            await self._client.aclose()

    # ------------------------------------------------------------------ #
    #  Auth                                                                #
    # ------------------------------------------------------------------ #

    async def _login(self) -> None:
        # Step 1: fetch CSRF cookie
        r = await self._client.get(f"{self._base}/api/v1/session/check")
        r.raise_for_status()
        self._csrf = self._client.cookies.get("fortipoc-csrftoken", "")

        # Step 2: open session
        r = await self._client.post(
            f"{self._base}/api/v1/session/open",
            json={"username": self._username, "password": self._password},
            headers=self._headers(),
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "error":
            errors = data.get("errors", {})
            raise ValueError(f"Login failed: {errors}")

        # Step 3: refresh CSRF token — Django rotates it after login
        self._csrf = self._client.cookies.get("fortipoc-csrftoken", self._csrf)

    async def _logout(self) -> None:
        await self._client.post(
            f"{self._base}/api/v1/session/close",
            headers={"X-FortiPoC-CSRFToken": self._csrf},
        )

    def _headers(self) -> dict:
        return {
            "X-FortiPoC-CSRFToken": self._csrf,
            "Referer": f"{self._base}/",
            "Origin": self._base,
        }

    # ------------------------------------------------------------------ #
    #  System / user                                                       #
    # ------------------------------------------------------------------ #

    async def register_token(self, token_secret: str) -> None:
        """Register using a token:secret string."""
        if ":" not in token_secret:
            raise ValueError("Registration value must be in 'token:secret' format")
        identity, secret = token_secret.split(":", 1)
        r = await self._client.post(
            f"{self._base}/api/v1/system/account",
            json={"mode": "token", "identity": identity, "password": secret, "interactive": False},
            headers=self._headers(),
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "error":
            raise ValueError(f"Registration failed: {data.get('errors', {})}")

    async def set_license_server(self, ip: str) -> None:
        """Set and enable the remote license server from an IP address."""
        url = f"https://{ip}/license/"
        r = await self._client.post(
            f"{self._base}/api/v1/system/license/client/server/url",
            json={"server": url},
            headers=self._headers(),
        )
        r.raise_for_status()
        r = await self._client.post(
            f"{self._base}/api/v1/system/license/client/server:enable",
            headers=self._headers(),
        )
        r.raise_for_status()

    async def _get_user_id(self, username: str) -> int:
        """Return the numeric ID of a user by username."""
        r = await self._client.get(
            f"{self._base}/api/v1/system/user",
            headers=self._headers(),
        )
        r.raise_for_status()
        users = r.json().get("object", [])
        for user in users:
            if user.get("username") == username:
                return user["id"]
        raise ValueError(f"User '{username}' not found on {self._base}")

    async def change_admin_password(self, current_password: str, new_password: str) -> None:
        """Change the admin user's password."""
        user_id = await self._get_user_id(self._username)
        r = await self._client.post(
            f"{self._base}/api/v1/system/user/password/{user_id}",
            json={"current_password": current_password, "new_password": new_password},
            headers=self._headers(),
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "error":
            raise ValueError(f"Password change failed: {data.get('errors', {})}")

    async def change_user_password(self, username: str, new_password: str) -> None:
        """Change any user's password (no current password required when called as admin)."""
        user_id = await self._get_user_id(username)
        r = await self._client.post(
            f"{self._base}/api/v1/system/user/password/{user_id}",
            json={"new_password": new_password},
            headers=self._headers(),
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "error":
            raise ValueError(f"Password change failed: {data.get('errors', {})}")

    # ------------------------------------------------------------------ #
    #  SSH keys                                                            #
    # ------------------------------------------------------------------ #

    async def list_ssh_keys(self) -> list[str]:
        """Return list of SSH public key strings configured on the instance."""
        r = await self._client.get(
            f"{self._base}/api/v1/system/account/ssh/keys",
            headers=self._headers(),
        )
        if not r.is_success:
            raise ValueError(f"SSH key list failed ({r.status_code}): {r.text}")
        return r.json().get("object", [])

    async def clear_ssh_keys(self) -> None:
        """Delete all SSH keys from the instance."""
        keys = await self.list_ssh_keys()
        for key in keys:
            r = await self._client.post(
                f"{self._base}/api/v1/system/account/ssh/keys:del",
                json={"key": key},
                headers=self._headers(),
            )
            if not r.is_success:
                raise ValueError(f"SSH key delete failed ({r.status_code}): {r.text}")

    async def add_ssh_key(self, public_key: str) -> None:
        """Add a public SSH key to the instance."""
        r = await self._client.post(
            f"{self._base}/api/v1/system/account/ssh/keys:add",
            json={"key": public_key},
            headers=self._headers(),
        )
        if not r.is_success:
            raise ValueError(f"SSH key add failed ({r.status_code}): {r.text}")
