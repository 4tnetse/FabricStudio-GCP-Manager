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

When your local app is upgraded, the Cloud Run backend should be updated to match. Go to **Settings → Scheduling** to check if the remote version is in sync.

To update Cloud Run manually:

```bash
gcloud run services update fabricstudio-scheduler \
  --region <your-region> \
  --image europe-west1-docker.pkg.dev/<project>/fabricstudio-remote/4tnetse/fabricstudio-gcp-manager:latest
```
