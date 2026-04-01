# Clone

Bulk-clone a workshop golden image to create multiple instances.

## Fields

| Field | Required | Description |
|---|---|---|
| **Source instance** | Yes | The base (`000`) instance to clone from. Auto-detected from the instance list. |
| **Workshop name** | Yes | Base name for the cloned instances. Auto-filled from the source instance name. Must start with a letter; only lowercase letters, digits and hyphens; no trailing hyphen; max 59 characters. |
| **Customer, Partner or Event** | No | Applied as a `purpose` label on all cloned instances (e.g. `fortinet-workshop`). Lowercase letters, digits, underscores and dashes only; max 63 characters. |
| **Destination zone** | No | Target zone for the clones. Auto-filled from the source instance zone; can be changed for cross-zone cloning. |
| **Clone range (From / To)** | Yes | Numeric range of instance suffixes to create (e.g. 1 to 20) |
| **Delete existing instances** | No | If checked, existing instances in the range are deleted before cloning. Instances with `delete=no` label are always protected. |

## Instance name preview

As you fill in the form, a preview shows the names that will be created:

```
fs-tve-partner-hol-001 to fs-tve-partner-hol-020
```

An info box also shows the total count and the number of batches (clones run in batches of 5).

## DNS

If DNS settings are configured in Settings, DNS records are created automatically for each cloned instance.

If DNS settings are incomplete, a warning dialog appears before cloning starts. You must either configure the missing settings or explicitly choose to continue without DNS record creation.

## Scheduling

Click the **Schedule** button next to Clone to schedule this job. The current form values are saved as the job payload. Requires Scheduling to be enabled in Settings.

## Output panel

The right panel streams live clone output. Each batch is shown as it completes.

The clone runs in the background. You can navigate to other pages while it is running — a status banner on the Clone page shows the current state (running / completed / failed) when you return, and a spinner appears on the Clone nav item while it is active.
