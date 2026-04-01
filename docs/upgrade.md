# Upgrade

## Docker

Pull the latest image and restart the container:

```bash
docker compose pull && docker compose up -d
```

> App data (keys, settings, configurations) is stored in the `fabricstudio-data` Docker volume and is preserved across upgrades.

---

## From source

Pull the latest code, reinstall dependencies, and restart:

```bash
git pull
python setup.py
python start.py
```

On **Windows**:

```bat
git pull
setup.bat
start.bat
```

---

## Version indicator

The version number at the bottom of the sidebar is followed by two coloured dots:

- **Local dot (left)** — indicates whether a newer version of Fabric Studio GCP Manager is available. Green means you are up to date; blue means the version is still being checked; orange means a newer version is available.
- **Remote dot (right)** — only shown when remote scheduling is configured. Green means the scheduling backend is running the same version as the local app; orange means they are out of sync.

Click the version number to open the **About** popup for details.

---

## Scheduling backend

When your local app is upgraded, the remote scheduling backend should be updated to match. The version sync status is visible in the sidebar (green dot = in sync, orange dot = out of sync) and in the **About** popup (click the version number at the bottom of the sidebar).

To upgrade the remote backend, click the version number to open the About popup. If the remote version is out of sync, an **↑ Upgrade** button appears next to the remote version. Click it — the app updates the remote scheduling backend to the current local version automatically, no manual steps needed.
