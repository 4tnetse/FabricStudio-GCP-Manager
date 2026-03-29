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

Configure and deploy remote scheduling via GCP Cloud Run and Cloud Scheduler.

| Setting | Description |
|---|---|
| **Enable remote scheduling** | Toggle to enable scheduled Clone and Configure jobs |
| **Detect Cloud Run** | Searches all GCP regions for the `fabricstudio-scheduler` service and auto-fills Region and Backend URL |
| **GCP Cloud Run Region** | Region where the scheduler Cloud Run service is deployed (auto-filled by Detect or Deploy) |
| **GCP Remote Backend URL** | HTTPS URL of the `fabricstudio-scheduler` Cloud Run service (auto-filled by Detect or Deploy) |
| **GCP Firestore Project ID** | GCP project that hosts Firestore. Defaults to the active project when scheduling is enabled |

Click **Save Scheduling** to apply changes.

### Deploy to GCP

Click **Deploy to GCP** to expand the deploy panel and set up the scheduling backend without leaving the app.

The panel first checks all required GCP permissions for the active service account and shows which are granted or missing. Fix any missing permissions before deploying (see [Scheduling setup](../configuration.md#scheduling-setup-optional) for the required roles).

Select a **VPC subnet** in the target region, then click **Start Deploy**. The app will:

1. Enable required GCP APIs (Cloud Run, Firestore, Cloud Scheduler, Cloud Build)
2. Create the `fabricstudio-gcp-manager` Firestore database in Native mode
3. Create the `fs-gcpbackend-to-instances` firewall rule (allows Cloud Run to reach instances over internal IPs)
4. Copy the container image to your project via Cloud Build (this step takes a few minutes)
5. Deploy the `fabricstudio-scheduler` Cloud Run service connected to your VPC
6. Inject required environment variables into the running service
7. Save the Cloud Run URL and region to Settings and enable remote scheduling

The deploy log streams live and stays visible after completion so you can review any warnings.

### Undeploy

Click **Undeploy** to remove all scheduling infrastructure for the active project. This will permanently delete:

- All Cloud Scheduler jobs
- The `fabricstudio-scheduler` Cloud Run service
- The `fs-gcpbackend-to-instances` firewall rule
- Container images from the project container registry
- All schedules and job run history from Firestore

Scheduling settings are cleared automatically after undeploy.
