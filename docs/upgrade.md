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

## Cloud Run (remote scheduling backend)

When your local app is upgraded, the Cloud Run backend should be updated to match. The version sync status is visible in the sidebar (green dot = in sync, orange dot = out of sync) and in the **About** popup (click the version number at the bottom of the sidebar).

To upgrade Cloud Run, click the version number to open the About popup. If the remote version is out of sync, an **↑ Upgrade** button appears next to the remote version. Click it — the app updates the Cloud Run service to the current local version automatically, no manual steps needed.
