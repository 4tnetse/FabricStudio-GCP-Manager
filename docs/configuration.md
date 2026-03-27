# Configuration

## Setup GCP for FS GCP Manager

### 1. Create a new VPC

Create a new project in GCP and create a new default VPC network at [GCP VPC networks](https://console.cloud.google.com/networking/networks).  
The new VPC network should be named default, Subnet creation mode set to automatic and the Dynamic routing mode set to global.

### 2. Configure the VPC firewall

Create two new firewall rules at [GCP Network Security Firewall Policies](https://console.cloud.google.com/net-security/firewall-manager/firewall-policies).  
These two rules will be used to control access to you Fabric Studio instances.

**Rule 1**
Name: workshop-source-networks  
Network: default  
Priority: 1001   
Direction: Ingress  
Action: Allow  
Taget tag: workshop-source-networks  
Source IPv4 range: your current public IP address  
TCP ports: 22, 80, 443, 8000, 8080, 8888, 10000-20000, 20808, 20909, 22222  
UDP ports: 53, 514, 1812, 1813  
Enforcement: enabled  

**Rule 2**
Name: workshop-source-any  
Network: default  
Priority: 1000  
Direction: Ingress  
Action: Allow  
Taget tag: workshop-source-any  
Source IPv4 range: 0.0.0.0/0  
TCP ports: 22, 80, 443, 8000, 8080, 8888, 10000-20000, 20808, 20909, 22222  
UDP ports: 53, 514, 1812, 1813  
Enforcement: disabled  

### 3. Obtain and upload Fabric Studio to GCP

Obtain the Fabric Studio image for GCP. This version has a raw disk compressed and zipped in a tar.gz.

If you have the .vmdk or .qcow2 you first need to convert it to a raw disk e.g.  
`qemu-img dd -f vmdk -O raw bs=4M count=1K if=fabricstudio.vmdk of=disk.raw tar -cvzf fabric-studio_2.0.6.tar.gz disk.raw`

Upload the tar.gz to [GCP Compute Images](https://console.cloud.google.com/compute/images)  
Note: skip OS Adaptation

### 4. Resize the Fabric Studio image

Create a temporary instance from the newly uploaded image at [GCP Compute Images](https://console.cloud.google.com/compute/images).

Set the disk size to 200GB and set the network tags workshop-source-networks and workshop-source-any in the instance creation wizard.

SSH to the new instance and set a strong password. you need to enter this password later in the Settings page.

Extend the disk by typing `system disk extend`

Shutdown the Fabric Studio instance: `system execute shutdown`

Create a new machine image, e.g. fabric-studio-200g,  from your temporary instance at [GCP Compute Instances](https://console.cloud.google.com/compute/instances).

### 5. Enable GCP DNS

You will need GCP Cloud DNS to auto generate DNS A records for your Fabric Studio instances.

Enable [GCP Cloud DNS API](https://console.cloud.google.com/net-services/dns).

Create a public DNS zone. E.g. labs.yourdomain.com

Open the new zone NS record. You will see the 4 NS records that your yourdomain.com DNS server needs to point to.


## First-time setup FS GCP Manager

On first launch, go to **Settings** and configure at least the following:

### 1. Service account key

Upload one or more GCP service account JSON key files. At least one key is required before any GCP operations will work.

To generate a key: **GCP Console → IAM & Admin → Service Accounts → select account → Keys tab → Add Key → JSON**

Keys can be renamed and deleted from Settings. The active project is selected per-key in the sidebar.

### 2. GCP Project

After uploading a key, select the active project from the sidebar project selector.

### 3. SSH public key

Paste your SSH public key to enable SSH command execution on instances.

### 4. Default admin password

Enter the strong admin password you configured in the GCP image.  
This pre-fills the current admin password field on the Configure screen and is used for Fabric Studio API access.

### 5. Default zone

Set your preferred GCP zone (e.g. `europe-west4-a`). Used as default when building or cloning instances.

### 6. DNS settings

Required for automatic DNS record creation during cloning:

| Setting | Example | Description |
|---|---|---|
| DNS Domain | `labs.yourdomain.com` | Base domain for instance FQDNs |
| Instance FQDN prefix | `fs` | Prefix applied to instance names in FQDNs |
| DNS Zone name | `labs-yourdomain-com` | Managed zone name in Google Cloud DNS |


## Scheduling setup (optional)

Scheduling allows Clone and Configure jobs to run automatically on a cron schedule. It uses GCP Cloud Scheduler to trigger jobs and a Cloud Run service (`fabricstudio-scheduler`) to execute them.

### 1. Enable required GCP APIs

Enable the following APIs in your GCP project:

- [Cloud Run API](https://console.cloud.google.com/apis/library/run.googleapis.com)
- [Cloud Scheduler API](https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com)
- [Firestore API](https://console.cloud.google.com/apis/library/firestore.googleapis.com)
- [Artifact Registry API](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com)

### 2. Create a Firestore database

Go to [Firestore](https://console.cloud.google.com/firestore) and create a new **Native mode** database. Choose the same region you plan to deploy the Cloud Run service in (e.g. `europe-west1`).

### 3. Grant IAM roles to the service account

The service account used by FS GCP Manager needs the following additional roles:

| Role | Purpose |
|---|---|
| `roles/datastore.user` | Read/write Firestore schedules and run logs |
| `roles/cloudscheduler.admin` | Create and manage Cloud Scheduler jobs |
| `roles/run.invoker` | Invoke the Cloud Run scheduling backend |
| `roles/run.viewer` | Auto-detect the Cloud Run service URL and region |
| `roles/iam.serviceAccountTokenCreator` | Generate OIDC tokens so Cloud Scheduler can authenticate to Cloud Run |

Grant these via the [IAM console](https://console.cloud.google.com/iam-admin/iam) or with `gcloud`:

```bash
SA="<your-service-account>@<project>.iam.gserviceaccount.com"
PROJECT="<your-project-id>"

for ROLE in roles/datastore.user roles/cloudscheduler.admin roles/run.invoker roles/run.viewer roles/iam.serviceAccountTokenCreator; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$SA" \
    --role="$ROLE"
done
```

### 4. Make the Docker image available to Cloud Run

Cloud Run cannot pull images directly from `ghcr.io`. Create an Artifact Registry **remote repository** that proxies GitHub Container Registry:

```bash
gcloud artifacts repositories create fabricstudio-remote \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Remote proxy for ghcr.io" \
  --mode=remote-repository \
  --remote-docker-repo=CUSTOM \
  --remote-docker-repo-uri=https://ghcr.io
```

Grant the service account read access to this repository:

```bash
gcloud artifacts repositories add-iam-policy-binding fabricstudio-remote \
  --location=europe-west1 \
  --member="serviceAccount:$SA" \
  --role="roles/artifactregistry.reader"
```

The image path to use in Cloud Run will be:

```
europe-west1-docker.pkg.dev/<project>/fabricstudio-remote/4tnetse/fabricstudio-gcp-manager:latest
```

### 5. Deploy the scheduling backend to Cloud Run

Deploy the `fabricstudio-scheduler` Cloud Run service using the Artifact Registry image path from the previous step:

```bash
gcloud run deploy fabricstudio-scheduler \
  --image europe-west1-docker.pkg.dev/<project>/fabricstudio-remote/4tnetse/fabricstudio-gcp-manager:latest \
  --region europe-west1 \
  --set-env-vars APP_MODE=backend \
  --no-allow-unauthenticated \
  --service-account <your-service-account>@<project>.iam.gserviceaccount.com \
  --memory 512Mi \
  --timeout 3600 \
  --network default \
  --subnet default \
  --vpc-egress private-ranges-only \
  --network-tags fs-gcp-manager-gcpbackend
```

> **Note:** The `--timeout 3600` is important — scheduled jobs (especially Configure jobs across many instances) can run for a long time. Cloud Run's default timeout of 300 seconds is too short.

### 6. Allow Cloud Run to reach Fabric Studio instances

When a scheduled job runs, the Cloud Run backend connects directly to each Fabric Studio instance over its **internal IP** (staying within the VPC). This requires VPC access and a matching firewall rule.

The deploy command in step 5 already configures VPC egress and attaches the network tag `fs-gcp-manager-gcpbackend`. You now need to create a firewall rule that allows traffic from that tag to reach your Fabric Studio instances:

```bash
gcloud compute firewall-rules create fs-gcpbackend-to-instances \
  --network default \
  --direction INGRESS \
  --priority 950 \
  --action ALLOW \
  --source-tags fs-gcp-manager-gcpbackend \
  --target-tags workshop-source-networks,workshop-source-any \
  --rules tcp:80,tcp:443
```

Or via the GCP Console at [GCP Network Security Firewall Policies](https://console.cloud.google.com/net-security/firewall-manager/firewall-policies):

| Field | Value |
|---|---|
| **Name** | `fs-gcpbackend-to-instances` |
| **Network** | `default` |
| **Priority** | `950` |
| **Direction** | Ingress |
| **Action** | Allow |
| **Source tags** | `fs-gcp-manager-gcpbackend` |
| **Target tags** | `workshop-source-networks`, `workshop-source-any` |
| **TCP ports** | `80`, `443` |

> **Why this is needed:** Fabric Studio instances are not publicly reachable by the Cloud Run backend. By routing only private-range traffic through the VPC and tagging the Cloud Run service, the backend can reach instances on their internal IPs without exposing them to the internet.

### 7. Configure scheduling in the app

In **Settings → Scheduling**:

1. Toggle **Enable remote scheduling** on.
2. Click **Detect Cloud Run** — this searches all GCP regions for the `fabricstudio-scheduler` service and auto-fills **GCP Cloud Run Region** and **GCP Remote Backend URL**.
3. Verify **GCP Firestore Project ID** (defaults to the active project).
4. Click **Save settings**.

Once saved, use the **Schedule** button on the Clone or Configure screens to create scheduled jobs, and monitor them from the [Schedules](screens/schedules.md) screen.

---

## Create a Fabric Studio License Server

All Fabric Studio instances will connect to this license server to obtain licenses needed in your labs.

### 1. Build the instance

In the Build page, fill out the fields and choose the 200GB image. Set the group to production.

Rename the instance to srv-<your initials>-license-001.

Edit the Labels and set purpose to licenseserver.

### 2. Configure the instance

In the Configure page, select the License server.

Enter the Fabric Studio Registration token:secret.

Set the hostame to License Server.

### 3. Enable the License Service

Login to your license server.

Go to System - Settings - Licensing

Enable the License Service.

### 4. Set a static internal IP address in GCP

Goto [GCP VPC network IP addresses](https://console.cloud.google.com/networking/addresses) and choose Reserve internal static IP address.

Give it a name, e.g. license-server-static-ip

Set the network to default and the subnetwork to the same range your current license server internal IP address belongs to.

Set Static IP address to Let me choose and enter the IP of the license server in the ustom IP address field.

### 5. Add a firewall rule in GCP

Add a new firewall rule in [GCP Network Security Firewall policies](https://console.cloud.google.com/net-security/firewall-manager/firewall-policies).

Name: fabric-studio-license-server  
Network: default  
Priority: 900  
Direction: Ingress  
Action: Allow  
Taget tag: workshop-source-networks  
Source IPv4 range: 10.0.0.0/8  
Destination IPv4 range: <License Server internal IP>/32  
Protocols and ports: All  
Enforcement: enabled