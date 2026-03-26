# SSH

Execute commands across multiple instances simultaneously via SSH.

## Selecting targets

Three methods are available for selecting target instances:

### Manual IP entry

Enter IP addresses directly in the **IP Addresses** text area, one per line. Click **Load all** to automatically populate the list with all public IPs from the active project.

### By name

Open the **Select instances by name** picker to choose instances by name. Only instances with a public IP are shown. The IP addresses are automatically added to the text area.

### By range

Open the **Select instances by range** panel, choose a **From instance** and enter a **To number**. The public IPs for all matching instances in that range are loaded into the text area.

## Execution mode

| Mode | Description |
|---|---|
| **Parallel** | All hosts run simultaneously |
| **Sequential** | Hosts run one at a time in order |

## Command

Enter the command to execute in the **Command** text area (e.g. Fabric Studio CLI commands like `runtime fabric uninstall`).

If a **configuration file** is selected, the command field is disabled and the commands from the file are used instead.

## Configuration file

Select a configuration file from the dropdown to use its commands instead of a manual command. See [SSH Configurations](configurations.md) for managing these files.

## Buttons

| Button | Description |
|---|---|
| **Test auth** | Test SSH connectivity to all selected hosts without running a command |
| **Execute** | Run the command or configuration file on all selected hosts |

## Output panel

The right panel streams live SSH output as responses come in from each host.
