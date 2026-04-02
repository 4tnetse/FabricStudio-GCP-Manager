# Configuration

## Setup GCP for FS GCP Manager

Before using FS GCP Manager, you need a GCP project with a service account that has permission to manage resources.

### 1. Create a new project

Go to the [GCP Console](https://console.cloud.google.com/) and create a new project for your Fabric Studio workloads. Give it a clear, recognisable name — all resources (instances, images, firewall rules, DNS zones) will be created inside this project.

### 2. Create a service account

Navigate to **[IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)** and click **Create service account**. Give it a descriptive name such as `fabricstudio-manager`. A service account acts as the identity that FS GCP Manager uses to make API calls on your behalf.

### 3. Assign the Owner role

On the **Grant this service account access to the project** step, add the **Owner** role (`roles/owner`). This grants the service account full access to manage all resources in the project, which is required for operations such as creating instances, managing firewall rules, enabling APIs, and deploying Cloud Run.

> If your organisation's security policy does not allow the Owner role, refer to the Project Health widget in FS GCP Manager Settings — it lists all individual permissions required and allows you to enable missing APIs directly from the app.

### 4. Create and download a private key

Open the service account you just created, go to the **Keys** tab, and click **Add Key → Create new key**. Select **JSON** as the key type and click **Create**. The key file is downloaded automatically to your computer.

This JSON file is what you upload to FS GCP Manager in the next step. Keep it secure — it provides programmatic access to your GCP project.


## First-time setup FS GCP Manager

On first launch, open **Settings** and work through the following steps in order.

### 1. Upload your service account key

Drag and drop the JSON key file you downloaded in the previous section onto the upload zone in the **Service Account Keys** widget, or click the zone to browse for the file. Once uploaded, the key appears in the list and the first project it covers is selected automatically. You can upload additional keys at any time to manage multiple projects.

The active project is always shown and changed in the sidebar project selector. Keys can be renamed to something more descriptive (e.g. the client or environment name) using the pencil icon.

### 2. Enable required APIs

After uploading a key, the **Project Health** widget runs automatically and checks whether all GCP APIs needed by the app are enabled. Any disabled APIs are listed in red. Click **Enable all** to enable every missing API in one go, or use the individual **Enable** buttons to enable them one at a time. The widget refreshes automatically when the operations complete.

If the **Cloud Resource Manager API** is not yet enabled you will see a prompt to enable it first — this API is required before any other checks can run.

### 3. Create a VPC network

Once the Compute Engine API is enabled, the **Default network (GCP VPC)** dropdown in Preferences becomes active and lists all VPC networks in the project. Select an existing network, or choose **Create new VPC …** to create one without leaving the app. The VPC is created with automatic subnets and global dynamic routing.

All operations in FS GCP Manager — instances, firewall rules, build, clone — are scoped to the selected network, so this step is required before any other pages become usable.

### 4. Configure DNS (optional)

DNS is required for automatic A record creation when cloning instances. Once the **Cloud DNS API** is enabled, the **DNS Zone** dropdown in Preferences lists all managed zones in the project. Select an existing zone, or choose **Create new DNS zone …** to create one directly from the app.

When creating a public zone, the app shows the four NS records assigned by Google Cloud DNS. Add these records at your domain registrar or parent DNS zone so that queries for your domain are routed to Google's name servers. Propagation can take up to 48 hours. You can always retrieve the NS records later by clicking the **ⓘ** icon next to the DNS Domain field.

Also set the **Instance FQDN prefix** (e.g. `fs`) to control how instance hostnames appear in DNS.

### 5. Configure the remaining preferences

With the network and DNS in place, fill in the remaining fields in the **Preferences** widget:

| Setting | Why it matters |
|---|---|
| **Initials** | Used as a prefix in instance names to identify your deployments |
| **Default zone** | Pre-selects the GCP zone on the Build and Clone pages (e.g. `europe-west4-a`) |
| **Default Fabric Studio admin password** | Pre-fills the admin password on the Configure page and is used for Fabric Studio API calls during shutdown and configuration |
| **SSH public key** | Installed on instances during Configure and Clone operations, required for the SSH page |
| **Default instance prefix** | Instance name prefix used when building new instances (e.g. `fs`) |

Click **Save settings** when done.


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

1. Let you select the target **region** (defaulting to your default zone's region) and **VPC subnet**.
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
- Select **This will be a new license server**. This will convert the instance into a license server as part of the configure operation, and configure a firewall rule allowing traffic from your instances to your license server. It will also make its internal IP address static.
- Set the **hostname** to `License Server`.

Note that the conversion will also set the following labels:

- `group=production`
- `delete=no` (this will prevent accidental deletion)
- `purpose=licenseserver`

The conversion automatically stops the instance, renames it to `srv-{prepend}-{product}-001` (incrementing if already taken), and restarts it. Instances with a name starting with `srv` do not get a DNS A record, so the license server will not be assigned a public DNS name.