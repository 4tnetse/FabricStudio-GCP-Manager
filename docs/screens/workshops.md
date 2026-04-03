# Workshops

Manage end-to-end workshop deployments from a single page: define the workshop, clone and configure instances, open a branded registration portal, and track attendees in real time.

> **Note:** The Clone, Configure, and Schedules pages remain available for manual operations.

---

## Workshop list

The main page shows a card for each workshop. Each card displays:

- **Name** — workshop identifier (used as the instance group name)
- **Status badge** — `draft`, `scheduled`, `deploying`, `running`, or `ended`
- **Attendees** — current registrations vs. total slots (e.g. `5 / 10`)
- **Start / End times** — scheduled dates (or `—` if not set)
- **Current activity** — live deployment message while the status is `deploying`
- **Portal URL** — shown when the portal is enabled, with a copy button

Click **Open** to manage a workshop in detail. Click the trash icon (available for `draft` and `ended` workshops) to delete it.

---

## Creating a workshop

Click **New Workshop** to open the creation dialog. Required fields:

| Field | Description |
|---|---|
| **Workshop name** | Short identifier, used in instance names (e.g. `partner-hol`) |
| **Admin passphrase** | Passphrase students enter on the registration portal |
| **Guest password** | Password set on the `guest` user during deployment |
| **Source image** | GCP image to clone instances from |
| **Machine type** | GCP machine type (e.g. `n2-standard-4`) |
| **Zone** | GCP zone for the instances (e.g. `europe-west4-a`) |
| **Count start / end** | Instance number range (e.g. `1` to `10` creates 10 instances) |

All fields can be changed later in the workshop detail view.

---

## Detail view

### Header actions

| Button | When visible | Description |
|---|---|---|
| **Start** | `draft` or `ended` | Clone instances from the source image, configure them, and mark the workshop `running` |
| **Stop** | `running` or `deploying` | Delete all workshop instances and mark `ended` |
| **Portal on / off** | Always | Deploy or tear down the registration portal Cloud Run service |

While the workshop is `deploying`, the header shows a spinner and the current activity message updates live.

### Settings panel

All workshop fields are editable at any time (including while the workshop is running). Click **Save** to apply changes.

| Field | Description |
|---|---|
| **Name** | Workshop identifier |
| **Admin passphrase** | Students enter this on the registration portal |
| **Guest password** | Set on the `guest` user via the Fabric Studio API during deployment |
| **Documentation link** | Shown to students after successful registration (step 2 of the portal) |
| **Source image** | GCP image used as the clone source |
| **Machine type** | GCP machine type |
| **Zone** | GCP zone |
| **Count start / end** | Instance number range |
| **Hostname template** | Template for setting the instance hostname (use `{count}` for the instance number) |
| **Fabric Workspace** | Fabric Workspace template to install on each instance |
| **Start time / End time** | Optional schedule — see [Scheduled start/stop](#scheduled-startstop) |

### Attendees panel

Shows all instance slots, whether claimed or empty. Columns:

- **Instance** — full instance name (e.g. `fs-tve-partner-hol-001`)
- **Name / Email / Company** — filled in from the portal when a student registers
- **Registered** — registration timestamp

**Actions:**
- **Remove** — unlink the student from their instance (slot becomes available again)
- **CSV** — export the full attendee list as a `.csv` file
- **PDF** — open the browser print dialog to save as PDF

---

## Deployment sequence

When **Start** is clicked:

1. Creates a temporary machine image from the source instance
2. Clones instances in batches of 5 — sets `group`, `delete`, and `purpose` labels; creates DNS records
3. Deletes the temporary machine image
4. Configures each instance in parallel:
   - Waits until the instance is ready
   - Sets the `guest` user password
   - Sets the hostname (from the hostname template)
   - Installs the Fabric Workspace template
5. Marks the workshop `running`

The **current activity** line in the header and card updates throughout the deployment.

---

## Registration portal

The portal is a Cloud Run service deployed per workshop. Students browse to the portal URL, complete a two-step registration, and receive their instance details.

### Step 1 — Registration form

Students enter:
- Name
- Email address
- Company
- Admin passphrase

**Security:** Five wrong passphrase attempts trigger a 15-minute browser session lockout (stored in Firestore, keyed by session cookie — not IP-based, so it works in classrooms where many students share an IP).

### Step 2 — Instance details

After a successful registration, students see:
- A link to their assigned instance (FQDN)
- Username (`guest`) and guest password
- A link to the documentation (from the **Documentation link** field)

Instance assignment is first-come first-served. Once all slots are taken, further registrations are rejected.

### Portal URL

The portal is served at `https://login.<configured DNS Domain>` when a DNS domain is configured. If the domain mapping cannot be created (e.g. domain ownership not yet verified in GCP), the `*.run.app` URL is used as a fallback.

When a DNS domain and Cloud DNS zone are configured, the CNAME record (`login.<domain>` → `ghs.googlehosted.com`) is created automatically. SSL provisioning takes 2–10 minutes after the CNAME is live.

### Toggling the portal manually

Click **Portal on / off** in the detail view header at any time, independent of the workshop schedule. Toggling off deletes the Cloud Run service and DNS CNAME. Toggling on rebuilds and redeploys.

---

## Scheduled start/stop

Set **Start time** and **End time** in the Settings panel to automate deployment and teardown.

When times are saved:

- A Cloud Scheduler job is created for each time that calls the `/start` or `/stop` endpoint on the Cloud Run backend
- Scheduler jobs are deleted when the workshop is deleted or the times are changed

> **Requires:** Remote scheduling must be enabled and a Cloud Run backend URL must be configured in [Settings](settings.md#scheduling).

---

## Multiple concurrent workshops

Multiple workshops can be active simultaneously — each has its own set of instances (identified by the `group` label), its own portal Cloud Run service, and its own Firestore attendee collection. There is no limit on the number of concurrent workshops.
