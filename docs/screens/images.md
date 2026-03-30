# Images

Browse and manage VM machine images in the active GCP project.

The Images page lists all available images with the following columns:

| Column | Description |
|---|---|
| **Name** | Image name |
| **Family** | Image family (e.g. `fortigate-7-6-1`) |
| **Status** | Image status (e.g. `READY`) |
| **Size (GB)** | Boot disk size |
| **Created** | Creation date |
| **Description** | Editable image description — click the pencil icon to edit inline |

Use the **Refresh** button to reload the list. The selected image can be used when building a new instance on the [Build](build.md) page.

## Import Image

Click **Import Image** to upload a `disk-image.tar.gz` file from your local device and register it as a GCP custom image.

### Import dialog fields

| Field | Description |
|---|---|
| **Image name** | GCP image name — lowercase letters, digits and hyphens, must start with a letter |
| **Family** | (Optional) Image family to assign (e.g. `fortigate`) |
| **Description** | (Optional) Free-text description |
| **Disk image file** | A `.tar.gz` archive containing a `disk.raw` file |

### Import flow

1. The app auto-creates a staging GCS bucket (`{project-id}-fs-image-import`) if it does not exist, with CORS configured for direct browser uploads.
2. The file is uploaded directly from your browser to GCS — a progress bar shows the upload percentage.
3. Once uploaded, the GCP Images API creates the image from the raw disk source (OS adaptation is skipped — equivalent to "Skip OS inspection and adaptation" in the GCP Console).
4. The staging file is deleted from GCS automatically after the image is created, whether the import succeeds or fails.

### Background operation

The dialog can be closed at any time during upload or import — the operation continues in the background. A status banner appears on the Images page showing the current progress. Click **View** on the banner to reopen the dialog and see the live log. Click **Cancel** to abort; any staging file already uploaded is deleted immediately.
