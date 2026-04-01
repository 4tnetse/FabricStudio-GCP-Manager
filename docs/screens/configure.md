# Configure

Bulk-configure one or more Fabric Studio instances via the Fabric Studio REST API.

Make sure the selected instances are running before starting a configure job.

## Select instances

Two methods are available for selecting instances:

### By name

Open the **Select instances by name** picker to browse and search all instances. Use **Select all** or filter by name and select a subset. Use **Clear** to deselect all.

### By range

Open the **Select instances by range** panel, choose a **From instance** and enter a **To number**. All instances in that range will be selected (names are constructed from the base name of the from-instance).

The selection summary shows a compact list of selected instances (contiguous ranges are compressed, e.g. `fs-tve-hol-001 to fs-tve-hol-010`).

## Configure section

All fields are optional — only fill in what you want to change. Operations are executed in the order listed below.

| Field | Description |
|---|---|
| **Admin password** | Current admin password (leave empty to use the default from Settings) |
| **New admin password** | New admin password to set (must meet policy: at least 3 of uppercase, lowercase, digit, special character) |
| **Fabric Studio Registration token:secret** | Fabric Studio registration token. Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxxxxxxxxx` (UUID + colon + 15-character secret, lowercase alphanumeric) |
| **SSH public keys** | Additional SSH public keys to install. The key from Settings is always installed. Check **Delete existing keys before adding** to replace all existing keys. Must be a valid public key starting with `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256/384/521`, or `ssh-dss`. |
| **Fabric Studio License Server** | Select the instance acting as the license server, or select **This will be a new license server** to convert the selected instances into license servers. |
| **Guest password** | New guest password (must meet policy: at least 3 of uppercase, lowercase, digit, special character) |
| **Hostname** | Hostname template; use `{count}` to insert the instance number (e.g. `Attendee - {count}`) |

### Converting an instance into a license server

Selecting **This will be a new license server** from the License Server dropdown runs a 7-step conversion on each selected instance:

1. Uninstall the Fabric Runtime
2. Delete all Fabrics
3. Clear the remote license server setting
4. Enable the built-in license service
5. Update GCP labels (`group=production`, `purpose=licenseserver`, `delete=no`)
6. Swap the firewall network tag from `fabric-studio` to `license-server`
7. Create the `license-server` firewall rule if it does not exist

## Fabric Workspace section

Configure Fabric Workspace templates from a source instance.

1. Select a **source instance** (must be running and registered).
2. Templates are loaded automatically from the source instance.
3. Add one or more **Fabrics** (name + template).
4. Optionally select one fabric to **install** immediately (radio button).
5. Check **Delete all workspaces** to remove existing workspaces (automatically checked and locked when any fabrics are defined).

## Running a configure job

Click **Configure (N)** to start the job immediately. Click **Schedule** to schedule it for a later time via Cloud Scheduler.

The job runs in the background. You can navigate to other pages while it is running — a status banner on the Configure page shows the current state (running / completed / failed) when you return.

## Output panel

The right panel streams live configure output. Progress is shown per instance.

## API call order

Operations are applied in the following order on each instance:

1. Authenticate (current admin password → new admin password will be configured if set)
2. Registration token
3. SSH keys
4. License server (or license server conversion — see above)
5. Guest password
6. Hostname
7. Fabric Workspace (delete existing → create fabrics → install selected fabric)
