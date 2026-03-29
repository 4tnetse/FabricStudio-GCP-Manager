# Settings

Configure your GCP connection and application preferences.

## Preferences

| Setting | Description |
|---|---|
| **Initials** | Short identifier used as a prefix in instance names (e.g. `tve`) |
| **Owner** | Owner GCP label applied to new instances |
| **Default zone** | Pre-selected zone on the Build and Clone pages |
| **Default instance prefix** | Instance name prefix (e.g. `fs`) |
| **Default group** | Group GCP label applied to new instances |
| **Default Fabric Studio admin password** | Used as the default admin password on the Configure page and for bulk shutdown via the Fabric Studio API |
| **DNS Domain** | Base domain for instance FQDNs (e.g. `labs.yourdomain.com`) |
| **Instance FQDN prefix** | Prefix applied to instance names in FQDNs (e.g. `fs`) |
| **DNS Zone name** | Managed zone name in Google Cloud DNS (e.g. `labs-yourdomain-com`) |
| **SSH public key** | Deafult public key installed on instances during Configure and Clone operations |

Click **Save settings** to apply changes. Click **Reset all settings** to remove all settings (requires re-configuration).

## Service account keys

Upload one or more [GCP service account JSON key](https://console.cloud.google.com/iam-admin/serviceaccounts) files. Each key can have multiple projects.

- **Upload** — drag and drop a `.json` key file onto the upload zone, or click to browse.
- **Rename** — click the pencil icon next to a key name.
- **Delete** — click the trash icon next to a key.

After uploading a key, a dialog appears to switch to the new project.

The active project is selected from the sidebar project selector.

## Appearance

Choose between three UI themes:

| Theme | Description |
|---|---|
| **Dark** | Dark slate theme (default) |
| **Light** | Light theme |
| **Security Fabric** | Fortinet Security Fabric style |

## Scheduling

Configure remote scheduling via GCP Cloud Run and Cloud Scheduler.

| Setting | Description |
|---|---|
| **Enable remote scheduling** | Toggle to enable scheduled Clone and Configure jobs |
| **Detect Cloud Run** | Auto-detects the Cloud Run service URL and region by searching all GCP regions for the `fabricstudio-scheduler` service |
| **GCP Cloud Run Region** | Region where the scheduler Cloud Run service is deployed (auto-filled by Detect) |
| **GCP Remote Backend URL** | HTTPS URL of the `fabricstudio-scheduler` Cloud Run service (auto-filled by Detect) |
| **GCP Firestore Project ID** | GCP project that hosts Firestore. Defaults to the active project when scheduling is enabled |

Scheduling requires the `fabricstudio-scheduler` Cloud Run service to be deployed separately with `APP_MODE=backend`.
