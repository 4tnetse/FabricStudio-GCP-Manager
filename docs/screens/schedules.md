# Schedules

Schedule Clone and Configure jobs to run automatically on a cron schedule via GCP Cloud Scheduler and Cloud Run.

> **Requires:** Remote scheduling must be enabled and configured in [Settings](settings.md#scheduling).

---

## Schedule list

The left panel shows all defined schedules. Each schedule displays:

- **Name** — user-defined label
- **Job type** — `clone` or `configure`
- **Enabled / disabled** badge
- **Cron expression** and timezone

### Actions

| Button | Description |
|---|---|
| **Run now** (▶) | Trigger the job immediately, regardless of the cron schedule |
| **Toggle** | Enable or disable the schedule (also pauses/resumes the Cloud Scheduler job) |
| **Delete** (🗑) | Delete the schedule and its Cloud Scheduler job |

Click a schedule row to select it and view its run history on the right.

---

## Run history

The right panel shows the run history for the selected schedule. Each run displays:

- **Status** — `running`, `completed`, or `failed`
- **Started at** — timestamp of when the run started
- **Duration** — elapsed time
- **Triggered by** — `scheduler` (automatic) or `manual` (Run now button)

Click a run row to expand it and view the full log output.

---

## Creating schedules

Schedules are created from the **Clone** or **Configure** pages using the **Schedule** button next to the main action button.

The schedule dialog lets you configure:

| Field | Description |
|---|---|
| **Name** | A descriptive label for this schedule |
| **Cron expression** | Standard 5-field cron syntax (e.g. `0 8 * * 1` for every Monday at 08:00) |
| **Timezone** | IANA timezone (e.g. `Europe/Brussels`). Pre-filled from your browser. |
| **Enabled** | Whether the schedule starts active |
| **Job parameters** | Read-only — shows the current form values that will be used when the job runs |

Preset buttons are available for common schedules (daily, weekly, hourly, etc.) and a human-readable preview of the cron expression is shown below the field.
