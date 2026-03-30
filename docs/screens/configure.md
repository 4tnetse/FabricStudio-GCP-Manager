# Configure

Bulk-configure one or more Fabric Studio instances via the Fabric Studio REST API.

## Select instances

Two methods are available for selecting instances:

### By name

Open the **Select instances by name** picker to browse and search all instances. Use **Select all** or filter by name and select a subset.

### By range

Open the **Select instances by range** panel, choose a **From instance** and enter a **To number**. All instances in that range will be selected (names are constructed from the base name of the from-instance).

The selection summary shows a compact list of selected instances (contiguous ranges are compressed, e.g. `fs-tve-hol-001 to fs-tve-hol-010`).

## Configure section

All fields are optional — only fill in what you want to change. Operations are executed in the order listed below.

| Field | Description |
|---|---|
| **Admin password** | Current admin password (leave empty to use the default from Settings) |
| **New admin password** | New admin password to set |
| **Fabric Studio Registration token:secret** | Fabric Studio registration token (format: `token:secret`) |
| **SSH public keys** | Additional SSH public keys to install. The key from Settings is always installed. Check **Delete existing keys before adding** to replace all existing keys. |
| **License Server IP** | Internal IP address of the Fabric Studio license server — must be a valid IPv4 address (e.g. `10.20.30.2`) |
| **Guest password** | New guest password (must meet policy: at least 3 of uppercase, lowercase, digit, special character) |
| **Hostname** | Hostname template; use `{count}` to insert the instance number (e.g. `Attendee - {count}`) |

## Fabric Workspace section

Configure Fabric Workspace templates from a source instance.

1. Select a **source instance** (must be running and registered).
2. Templates are loaded automatically from the source instance.
3. Add one or more **Fabrics** (name + template).
4. Optionally select one fabric to **install** immediately (radio button).
5. Check **Delete all workspaces** to remove existing workspaces before creating new ones (automatically checked when any fabrics are defined).

!!! warning
    If template fetching fails with a DNS error, make sure the source instance is running and has a valid DNS record.

## Output panel

The right panel streams live configure output. Progress is shown per instance.

## API call order

Operations are applied in the following order on each instance:

1. Authenticate (current admin password → new admin password will be configured if set)
2. Registration token
3. SSH keys
4. License server
5. Guest password
6. Hostname
7. Fabric Workspace (delete existing → create fabrics → install selected fabric)
