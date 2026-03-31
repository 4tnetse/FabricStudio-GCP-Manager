# Images

Browse and manage VM machine images in the active GCP project.

The Images page lists all available images with the following columns:

| Column | Description |
|---|---|
| **Name** | Image name — click the pencil icon to rename inline |
| **Family** | Image family (e.g. `fortigate-7-6-1`) — click the pencil icon to edit inline |
| **Status** | Image status (e.g. `READY`) |
| **Size (GB)** | Boot disk size |
| **Created** | Creation date |
| **Description** | Free-text description — click the pencil icon to edit inline |

For all inline edits, press **Enter** to save or **Escape** to cancel.

Use the **Refresh** button to reload the list.

## Deleting an image

Click the trash icon on any row to delete the image. A confirmation dialog appears before the delete is executed. This action cannot be undone.

## Renaming an image

Click the pencil icon in the **Name** column to rename an image. Renaming runs as a background operation (GCP creates a new image from the existing one, then deletes the original). A status banner appears at the top of the page showing the rename progress. The image list refreshes automatically when the rename completes.

## Import Image

Click **Import Image** to upload a `disk-image.tar.gz` file from your local device and register it as a GCP custom image. The button is disabled while another import is already in progress.

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

The dialog can be closed at any time during upload or import — the operation continues in the background. A status banner appears on the Images page showing the current progress (including an inline upload progress bar during the upload phase). Click **View** on the banner to reopen the dialog and see the live log. Click **Cancel** to abort; any staging file already uploaded is deleted immediately.
