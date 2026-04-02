# Instances

Overview of all GCP instances in the active project.

## Summary cards

The top of the page shows three stat cards:

| Card | Description |
|---|---|
| **Total Instances** | Total number of instances in the project |
| **Running** | Number of instances with status `RUNNING` |
| **Stopped** | Number of instances with status `TERMINATED` |

## Instance table

The table lists all instances with the following columns: name, zone, status, machine type, public IP, labels, and optionally FQDN (shown when a DNS prefix and domain are configured in Settings).

### Filtering

- **Name search** — free-text search on instance name
- **Group filter** — filter by the `group` GCP label
- **Purpose filter** — filter by the `purpose` GCP label
- **Status filter** — filter by instance status (`RUNNING`, `TERMINATED`, `STAGING`, `PROVISIONING`, `STOPPING`, `UNKNOWN`), or all instances
- **Zone filter** — filter by GCP zone

### Instance detail

Click any row to open a detail popup with:

- Status
- Zone, machine type, vCPUs, memory
- Boot disk size
- Estimated or exact hourly cost (`~` indicates an estimate based on list price)
- Public IP and internal IP
- FQDN (only shown when DNS is configured in Settings)
- Creation time
- All GCP labels
- All GCP tags (used for firewall rules)

### Row actions

Each row has an actions menu (three-dot) with:

| Action | Condition | Description |
|---|---|---|
| **Start** | Instance is stopped | Start the instance |
| **Stop** | Instance is running | Stop the instance |
| **Shutdown** | Instance is running | Gracefully shut down via Fabric Studio API |
| **Rename** | Instance is not running | Rename the instance (disabled while running) |
| **Change Machine Type** | Any | Change the machine type in GCP |
| **Move Zone** | Any | Move the instance to a different zone in GCP |
| **Edit Labels** | Any | Open the Labels page for this instance |
| **Delete** | Any | Permanently delete the instance |

### Bulk actions

Select multiple instances using the checkboxes. A bulk action bar appears at the top of the table:

| Action | Applies to |
|---|---|
| **Start** | Stopped instances only |
| **Stop** | Running instances only |
| **Shutdown** | Running instances only — uses Fabric Studio API |
| **Schedule deletion** | All selected — opens a date/time picker to schedule deletion via Cloud Scheduler |
| **Delete** | All selected — requires confirmation, deletes immediately |

#### Shutdown password prompt

If the default admin password from Settings is incorrect, a popup will appear asking for the password. In bulk mode, additional options are available:

- **Skip instance** — skip this instance and continue with the next
- **Cancel everything** — abort the remaining shutdowns
- **Retry Shutdown** — retry this instance with the entered password
- **Use for all** — use the entered password for all remaining instances in the queue (only shown when more than one instance is pending)
