# Images

Browse available VM machine images in the active GCP project.

The Images screen lists all available images with the following columns:

| Column | Description |
|---|---|
| **Name** | Image name |
| **Family** | Image family (e.g. `fortigate-7-6-1`) |
| **Status** | Image status (e.g. `READY`) |
| **Size (GB)** | Boot disk size |
| **Created** | Creation date |
| **Description** | Image description |

Images are loaded from the GCP Compute Engine API. Use the **Refresh** button to reload the list. The selected image can be used when building a new instance on the [Build](build.md) screen.
