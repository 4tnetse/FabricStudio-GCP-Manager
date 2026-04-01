# Schedules

Schedule Clone, Configure, and SSH jobs to run automatically via GCP Cloud Scheduler and Cloud Run.

> **Requires:** Remote scheduling must be enabled and configured in [Settings](settings.md#scheduling).

---

## Schedule list

The left panel shows all defined schedules. Each schedule displays:

- **Name** — user-defined label
- **Job type** — `clone`, `configure`, or `ssh`
- **Last run status** badge — `running`, `last run: ok`, or `last run: error`
- **Scheduled date/time** and timezone

### Actions

| Button | Description |
|---|---|
| **Run now** (▶) | Trigger the job immediately, regardless of the cron schedule |
| **Preview** (👁) | Show the job parameters and who created the schedule |
| **Reschedule** (📅) | Change the run date, time, and timezone |
| **Delete** (🗑) | Delete the schedule — a confirmation dialog warns that the Cloud Scheduler job will also be removed |

Click a schedule row to select it and view its run history on the right.

---

## Run history

The right panel shows the run history for the selected schedule. Each run displays:

- **Status** — `running`, `completed`, or `failed`
- **Started at** — timestamp of when the run started
- **Duration** — elapsed time
- **Triggered by** — `scheduler` (automatic) or `manual` (Run now button)

Click a run row to expand it and view the full log output. Runs that are currently active expand automatically and their log is polled live until the run finishes. If a run failed, an error summary is shown at the bottom of the log.

---

## Creating schedules

Schedules are created from the **Clone**, **Configure**, or **SSH** pages using the **Schedule** button next to the main action button.

The schedule dialog lets you configure:

| Field | Description |
|---|---|
| **Name** | A descriptive label for this schedule |
| **Run at** | Date and time pickers — month, day, year, hour, minute (in 5-minute steps) |
| **Timezone** | Dropdown of common IANA timezones (e.g. `Europe/Brussels`). Pre-filled from your browser. |
| **Job parameters** | Read-only JSON — shows the current form values that will be used when the job runs |

A preview of the selected date and time is shown below the time pickers. The schedule always starts enabled.

### Rescheduling

Click the **Reschedule** (📅) button on any schedule to open the same date/time/timezone picker and update when the job next runs.
