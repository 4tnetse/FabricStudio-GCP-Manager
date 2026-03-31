# SSH

Execute commands across multiple instances simultaneously via SSH.

## Selecting targets

Three methods are available and can be combined:

### By name

Open the **Select instances by name** picker to choose instances by name. All instances are shown — use the search box to filter, **Select all** to select all visible, or **Clear** to deselect all. A selection summary shows the selected instances in compact range notation.

When instances are selected by name, their public IP is used (internal IP as fallback). IPs are resolved automatically — they are not shown in the IP Addresses field.

### By range

Open the **Select instances by range** panel, choose a **From instance** and enter a **To number**. Matching instance names are added to the selection and their IPs resolved the same way as by-name selection.

### Manual IP entry

Enter IP addresses directly in the **IP Addresses** field, one per line. Click **Load internal IPs** or **Load external IPs** to auto-populate the field with all internal or external IPs from the active project.

The manual IP field and name/range selection can be used together — the final address list is deduplicated.

## Execution mode

| Mode | Description |
|---|---|
| **Parallel** | All hosts run simultaneously |
| **Sequential** | Hosts run one at a time in order |

## Configuration file

Select a configuration file from the dropdown to use its commands instead of a manual command. See [SSH Configurations](configurations.md) for managing these files.

## Command

Enter the command to execute (e.g. Fabric Studio CLI commands like `get system status`).

If a **configuration file** is selected, the command field is disabled and the commands from the file are used instead.

## Buttons

| Button | Description |
|---|---|
| **Test auth** | Test SSH connectivity to all selected hosts without running a command |
| **Execute** | Run the command or configuration file on all selected hosts |
| **Schedule** | Schedule this SSH job via Cloud Scheduler (uses internal IPs only — external IPs in the manual list are skipped with a warning) |

## Output panel

The right panel streams live SSH output as responses come in from each host.

The job runs in the background. You can navigate to other pages while it is running — a status banner on the SSH page shows the current state (running / completed / failed) when you return.
