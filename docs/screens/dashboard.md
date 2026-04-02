# Dashboard

The Dashboard gives you a live overview of your project at a glance. It is the first page you see after the Instances list and is always reachable from the **Dashboard** entry in the sidebar.

The page is organised as a responsive grid of widgets. Each widget is self-contained, loads its own data, and links to the relevant full-screen page for further action.

Widgets can be reordered by dragging the grip handle that appears in the top-right corner of each widget on hover. The order is saved in the browser and persists across page refreshes.

---

## Widgets

### Instance Summary

Shows the total number of instances in the active project, split into three counters: **Total**, **Running**, and **Stopped**. If any instances are in a transitional state (starting, stopping, suspending, etc.) an additional **transitioning** banner appears below the counters. Links to the Instances page.

### Cost Estimate

Calculates a live hourly cost estimate for all currently running instances by looking up the on-demand price for each unique machine type and zone combination. Also shows projected **daily** and **monthly** costs. If pricing data is unavailable for a machine type the widget still shows the number of running instances. Links to the Costs page.

### Instance Groups

Groups all instances by their `group` GCP label and shows a mini progress bar for each group indicating how many instances are running versus the total. Groups are sorted by the number of running instances, descending. Up to six groups are shown; any additional groups are noted with a count. Links to the Instances page.

### License Server

Shows the name, status, internal IP, and machine type of the instance labelled `purpose=licenseserver`. The status is shown as a solid colour badge: green for **RUNNING**, red for **TERMINATED** or **STOPPED**, orange for transitional states. If no license server is found, a hint is shown to use Configure to set the purpose label. Links to the Configure page.

### Schedules

Lists the configured schedules, sorted by enabled state then alphabetically. Each row shows the job type as a colour-coded badge (purple for Configure, blue for Clone, teal for SSH), the schedule name, and the scheduled date and time in a human-readable format. An enabled/disabled dot is shown on the right. Up to five schedules are shown. Links to the Schedules page.

### Recent Activity

Shows the three most recent job run results from your schedules. Each row shows a status badge (green for completed, red for failed, yellow for running), the schedule name, and how long ago the run finished. Links to the Schedules page.

### Images

Shows the total number of machine images in the active project and their combined disk size. The three most recently created images are listed by name and creation date. Links to the Images page.

### Project Health

Shows a summary of the full Project Health check from Settings. Displays a large shield icon (green = all OK, red = issues found) with a count of passing checks out of the total. If the health check has not been run yet, a prompt is shown to open Settings. Links to the Settings page.

### Firewall

Shows the total number of firewall rules, whether Global Access is enabled, how many IPs are in the Source IP Allowlist, and the three highest-priority active rules. Links to the Firewall page.
