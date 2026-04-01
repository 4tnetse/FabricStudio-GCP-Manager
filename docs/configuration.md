# Configuration

## Setup GCP for FS GCP Manager

### 1. Create a new VPC

Create a new project in GCP and create a new default VPC network at [GCP VPC networks](https://console.cloud.google.com/networking/networks).  
The new VPC network should be named `default`, Subnet creation mode set to automatic and the Dynamic routing mode set to global.

### 2. Enable GCP DNS (optional)

You will need GCP Cloud DNS to auto generate DNS A records for your Fabric Studio instances.

Enable [GCP Cloud DNS API](https://console.cloud.google.com/net-services/dns).

Create a public DNS zone. E.g. labs.yourdomain.com

Open the new zone NS record. You will see the 4 NS records that your yourdomain.com DNS server needs to point to.


## First-time setup FS GCP Manager

On first launch, go to **Settings** and configure at least the following:

### 1. Service account key

Upload one or more GCP service account JSON key files. At least one key is required before any GCP operations will work.

To generate a key: **[GCP Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → select account → Keys tab → Add Key → JSON**

Keys can be renamed and deleted from Settings. The active project is selected per-key in the sidebar.

### 2. GCP Project

After uploading a key, select the active project from the sidebar project selector.

### 3. SSH public key

Paste your SSH public key to enable SSH command execution on instances via the [SSH](screens/ssh.md) page.

### 4. Default admin password

Enter the strong admin password you configured in the GCP image.  
This pre-fills the current admin password field on the Configure page and is used for Fabric Studio API access. The workshop students will try to login with admin so it is highly recommended to choose a strong password.

### 5. Default zone

Set your preferred GCP zone (e.g. `europe-west4-a`). Used as default when building or cloning instances. Note that a different zone can always be set when creating instances.

### 6. DNS settings (optional)

Required for automatic DNS record creation during cloning:

| Setting | Example | Description |
|---|---|---|
| DNS Domain | `labs.yourdomain.com` | Base domain for instance FQDNs |
| Instance FQDN prefix | `fs` | Prefix applied to instance names in FQDNs |
| DNS Zone name | `labs-yourdomain-com` | Managed zone name in Google Cloud DNS |


## Scheduling setup (optional)

Scheduling allows Clone, Configure and SSH jobs to run automatically on a cron schedule. It uses GCP Cloud Scheduler to trigger jobs and a Cloud Run service (`fabricstudio-scheduler`) to execute them. The Cloud Run service will spin up a Fabric Studio GCP Manager instance in remote backend mode. This instance executes your configured job and will immediately be shut down when finished. This will keep your GCP costs to a minimum.

### 1. Grant IAM roles to the service account

The service account needs the following roles to deploy and use scheduling. Grant them via the [IAM console](https://console.cloud.google.com/iam-admin/iam) or with `gcloud`:

| Role | Purpose |
|---|---|
| `roles/datastore.owner` | Create and read/write the Firestore database for schedules and run logs |
| `roles/cloudscheduler.admin` | Create and manage Cloud Scheduler jobs |
| `roles/run.admin` | Deploy and manage the Cloud Run scheduler service |
| `roles/run.invoker` | Invoke the Cloud Run scheduling backend |
| `roles/run.viewer` | Auto-detect the Cloud Run service URL and region |
| `roles/iam.serviceAccountUser` | Deploy Cloud Run with the default compute service account (`actAs` permission) |
| `roles/cloudbuild.builds.editor` | Run Cloud Build to copy the container image to your project |
| `roles/serviceusage.serviceUsageAdmin` | Enable required GCP APIs (Cloud Run, Firestore, Cloud Scheduler, Cloud Build) |
| `roles/compute.securityAdmin` | Create the `fs-gcpbackend-to-instances` firewall rule |

```bash
SA="<your-service-account>@<project>.iam.gserviceaccount.com"
PROJECT="<your-project-id>"

for ROLE in roles/datastore.owner roles/cloudscheduler.admin roles/run.admin roles/run.invoker roles/run.viewer roles/iam.serviceAccountUser roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageAdmin roles/compute.securityAdmin; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$SA" \
    --role="$ROLE"
done
```

### 2. Deploy from the app (recommended)

Open **Settings → Scheduling** and click **Deploy to GCP**. The deploy panel will:

1. Check that all required GCP permissions are in place and show which are missing. Also checks that the Firestore database (if it already exists) is in Native mode — Datastore mode is not supported.
2. Let you select the target **region** (defaulting to your default zone's region) and **VPC subnet**.
3. On clicking **Start Deploy**, the app will automatically:
   - Enable required GCP APIs (Cloud Run, Firestore, Cloud Scheduler, Cloud Build)
   - Create the `fabricstudio-gcp-manager` Firestore database in Native mode
   - Create the `fs-gcpbackend-to-instances` firewall rule so Cloud Run can reach instances over internal IPs
   - Copy the container image to your project's container registry via Cloud Build
   - Deploy (or update) the `fabricstudio-scheduler` Cloud Run service with the correct settings
   - Save the Cloud Run URL and region to your settings and enable remote scheduling

The deploy log streams live in the panel. Keep it open to see progress and any warnings.

Once deployed, use the **Schedule** button on the Clone, Configure, or SSH pages to create scheduled jobs, and monitor them from the [Schedules](screens/schedules.md) page.

To remove Cloud Run and all associated resources, click **Undeploy** in the same widget. This deletes the Cloud Run service, Cloud Scheduler jobs, firewall rule, container images, and all Firestore data for the project.

---

### Manual deploy (fallback)

If you prefer to deploy manually with `gcloud`, follow these steps.

#### Enable required GCP APIs

Enable the following APIs in your GCP project:

- [Cloud Run API](https://console.cloud.google.com/apis/library/run.googleapis.com)
- [Cloud Scheduler API](https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com)
- [Firestore API](https://console.cloud.google.com/apis/library/firestore.googleapis.com)
- [Cloud Build API](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com)

#### Create a Firestore database

Go to [Firestore](https://console.cloud.google.com/firestore) and create a new **Native mode** database named `fabricstudio-gcp-manager`. Choose the same region as your Cloud Run deployment (e.g. `europe-west1`).

#### Copy the container image to your project

Cloud Run needs the image in your project's registry. Use Cloud Build to copy it from `ghcr.io`:

```bash
PROJECT="<your-project-id>"
VERSION="<current-version>"  # e.g. 2.5

gcloud builds submit --no-source \
  --project=$PROJECT \
  --config=- <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: [pull, ghcr.io/4tnetse/fabricstudio-gcp-manager:latest]
  - name: gcr.io/cloud-builders/docker
    args: [tag, ghcr.io/4tnetse/fabricstudio-gcp-manager:latest, gcr.io/$PROJECT/fabricstudio-gcp-manager:v$VERSION]
  - name: gcr.io/cloud-builders/docker
    args: [push, gcr.io/$PROJECT/fabricstudio-gcp-manager:v$VERSION]
images:
  - gcr.io/$PROJECT/fabricstudio-gcp-manager:v$VERSION
EOF
```

#### Deploy the Cloud Run service

```bash
PROJECT="<your-project-id>"
REGION="europe-west1"
SA="<your-service-account>@<project>.iam.gserviceaccount.com"
VERSION="<current-version>"
BACKEND_URL="https://fabricstudio-scheduler-<hash>-<region>.a.run.app"  # fill in after first deploy

gcloud run deploy fabricstudio-scheduler \
  --image gcr.io/$PROJECT/fabricstudio-gcp-manager:v$VERSION \
  --region $REGION \
  --set-env-vars APP_MODE=backend,BACKEND_URL=$BACKEND_URL,CLOUD_RUN_REGION=$REGION,FIRESTORE_DATABASE_ID=fabricstudio-gcp-manager \
  --no-allow-unauthenticated \
  --service-account $SA \
  --memory 512Mi \
  --timeout 3600 \
  --network default \
  --subnet default \
  --vpc-egress private-ranges-only \
  --network-tags fs-gcp-manager-gcpbackend
```

> **Note:** `--timeout 3600` is important — Configure jobs across many instances can run for a long time.

#### Create the firewall rule

This rule allows the Cloud Run backend (identified by its network tag) to reach Fabric Studio instances over internal IPs:

| Field | Value |
|---|---|
| **Name** | `fs-gcpbackend-to-instances` |
| **Network** | `default` |
| **Priority** | `950` |
| **Direction** | Ingress |
| **Action** | Allow |
| **Targets** | All instances in the network |
| **Source tag** | `fs-gcp-manager-gcpbackend` |
| **TCP ports** | `80`, `443` |

```bash
gcloud compute firewall-rules create fs-gcpbackend-to-instances \
  --network default \
  --priority 950 \
  --direction INGRESS \
  --action ALLOW \
  --source-tags fs-gcp-manager-gcpbackend \
  --rules tcp:80,tcp:443
```

#### Configure scheduling in the app

In **Settings → Scheduling**:

1. Toggle **Enable remote scheduling** on.
2. Click **Detect Cloud Run** to auto-fill the region and backend URL, or enter them manually.
3. Verify **GCP Firestore Project ID** (defaults to the active project).
4. Click **Save settings**.

---

## Import the Fabric Studio GCP image

Obtain a Fabric Studio GCP image and upload it via the [Images](screens/images.md) page. The GCP image must be a `disk.raw` file packaged inside a `.tar.gz` archive — other formats will not work.

## Create a Fabric Studio License Server

To create a license server, build an instance using the [Build](screens/build.md) page and then configure it using the [Configure](screens/configure.md) page.

- Enter the **registration token** `secret` to automatically register the Fabric Studio instance.
- Select **This will be a new license server**. This will convert the instance into a license server as part of the configure operation, and configure a firewall rule allowing traffic from your instances to your license server.
- Set the **hostname** to `License Server`.

Note that the conversion will also set the following labels:

- `group=production`
- `delete=no` (this will prevent accidental deletion)
- `purpose=licenseserver`

The license server does not need a public DNS name, so when the instance has been converted, stop it and rename it to `srv-...`. Instances with a name that starts with `srv` will not get a DNS A record. After renaming is done, start the instance again.