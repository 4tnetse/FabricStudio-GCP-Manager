# Changelog

## 3.12

New **Workshops** page for end-to-end workshop management.

- **Workshop list**: cards showing status, attendee count (registered/total), start/end times, current activity, and portal URL.
- **Deployment**: clicking **Start** clones the source image in batches of 5, sets group/delete/purpose labels, creates DNS records, then configures each instance in parallel (guest password, hostname, Fabric Workspace). Live activity line updates throughout.
- **Teardown**: **Stop** deletes all workshop instances and DNS records.
- **Registration portal**: a branded Cloud Run service (Security Fabric dark theme, Fortinet red) deployed per workshop. Two-step registration: name/email/company/passphrase → FQDN link, guest credentials, and documentation link. First-come first-served instance assignment. Five wrong passphrase attempts trigger a 15-minute browser session lockout.
- **Custom portal domain**: portal served at `login.<DNS Domain>` via Cloud Run domain mapping; CNAME record created automatically in Cloud DNS. Falls back to `*.run.app` URL if domain mapping fails.
- **Portal toggle**: enable or disable the portal independently of the workshop schedule.
- **Attendees panel**: all instance slots shown (claimed and empty), with Remove button, CSV export, and PDF print.
- **Scheduled start/stop**: setting Start time or End time creates Cloud Scheduler jobs that automatically start or stop the workshop. Requires remote scheduling to be configured.
- **Multiple concurrent workshops**: each workshop has its own instance group, portal service, and attendee collection.

## 3.11

The Costs page now shows detailed cost estimates based on the GCP Cloud Billing Catalog API — no BigQuery or billing account permissions required.

- **Running Instance Costs**: table of all running instances with hourly, daily, and monthly on-demand estimates, plus a totals row.
- **Cost per Workshop**: groups instances by their `group` label, showing instance count, start time, running duration, cost so far, scheduled deletion date, and projected total cost.
- **Projected Monthly Cost**: four summary cards — accrued this month, remaining in month, scheduled workshops, and projected total.
- **Billing account notice**: if the service account lacks billing read access, a soft notice is shown and cost estimates are still displayed.
- **Cost Estimate widget** (Dashboard): updated to show total hourly, daily, and monthly cost across all running instances.

## 3.10

Instance rename and license server conversion now also rename the boot disk so the disk name always matches the instance name. GCP has no disk rename API, so this is done as: create snapshot → create new disk from snapshot → detach old disk → attach new disk → delete old disk → delete snapshot. A message in the output panel warns that the step may take a few minutes.

Previously, renaming left the old disk name behind. This caused Build jobs to fail with a `400 — disk already in use` error when trying to create a new instance with the same name as the renamed one.

## 3.9

Dashboard widgets are now draggable — hover any widget to reveal a grip handle in the top-right corner and drag to reorder. The layout is saved in the browser and persists across refreshes.

Additional fixes and improvements:

- **Project Health widget** (Dashboard): replaced the dot-grid with a summary view showing a large shield icon and a passing/total check count.
- **Instance Groups widget**: fixed — was reading the `workshop` label instead of the `group` label, causing all groups to appear as `—`.
- **Schedules widget**: all job type badges now have equal width so columns align consistently.
- **Auto-delete schedule names**: no longer include the date/time in the schedule name (the date is already visible below the name in the Schedules page).
- **Schedule preview popup**: delete schedules now show the full list of instances that will be deleted.
- **Auto-delete output log**: the confirmation line now lists all instance names that have been scheduled for deletion.
- **Auto-delete via Cloud Scheduler**: fixed a bug where auto-delete schedules created from Configure or Clone were never executed by Cloud Scheduler — the service account email was set to the literal string `"auto-delete"` instead of the actual SA email, causing Cloud Scheduler job creation to fail silently.
- **Settings**: the Default network (GCP VPC) dropdown no longer auto-opens when navigating to the Settings page.

## 3.8

**Auto-delete**: schedule automatic deletion of instances at a specific date and time.

- **Clone page**: an **Auto-delete** checkbox below the form opens a date/time picker and timezone selector. When the clone job completes successfully, a delete schedule is created automatically for all cloned instances. A confirmation line is shown in the output panel.
- **Configure page**: same checkbox and picker, creates a delete schedule for all configured instances on success.
- **Instances page**: a **Schedule deletion** button in the bulk action bar opens the schedule dialog for the selected instances, creating a delete schedule immediately.

Instances with the GCP label `delete=no` are always skipped at deletion time regardless of the schedule. The auto-delete schedule appears in the Schedules page with a red badge and full run history.

## 3.7

New **Dashboard** page with nine overview widgets: Instance Summary (total, running, stopped, transitioning counts), Cost Estimate (live hourly, daily, and monthly cost for running instances), Instance Groups (per-workshop progress bars), License Server (status, IP, and machine type of the `purpose=licenseserver` instance), Schedules (upcoming schedules with job type badge and human-readable date/time), Recent Activity (last three schedule job run results), Images (image count, total disk size, and three most recent images), Project Health (compact dot-grid status for all permission groups and APIs), and Firewall (rule count, Global Access state, IP Allowlist size, and top rules).

**Project Health**: when the Service Usage API itself is not enabled on a project, the widget now shows a clear explanation and a direct link to the GCP Console enable page instead of silently reporting all APIs as disabled. Fixed a bug where the token refresh was skipped under certain credential states, causing all API checks and the enable-API action to fail with a 500 error.

Status badges across all dashboard widgets now use solid colour backgrounds with white text and no border.

## 3.6

DNS zone management in Preferences: when the Cloud DNS API is enabled, the DNS Zone field becomes a dropdown listing all managed zones in the active project. Selecting a zone auto-populates the DNS Domain field (which becomes read-only) and shows the zone type (public or private) as a read-only label below the dropdown.

**Create new DNS zone** dialog: enter a zone name, DNS name, and choose the zone type. Private zones are automatically scoped to the selected VPC network. After creating a public zone, the dialog shows the four NS records assigned by Google Cloud DNS — copy them to your registrar to make the zone authoritative. The same NS records are always accessible via the **ⓘ** icon next to the DNS Domain field.

The **Default network (GCP VPC)** dropdown now only fetches networks when the Compute Engine API is confirmed enabled (via the Project Health widget), avoiding failed requests when the API is not yet active.

**Project Health**: added an **Enable all** button in the APIs section that enables every disabled API in a single click, sequentially, with a single health check refresh at the end.

**Cloud Run deploy**: removed the redundant GCP permissions check from the deploy panel — use the **Scheduling** group in Project Health instead. Fixed a deploy failure where Firestore database creation returned a 500 error immediately after enabling the Firestore API (GCP propagation delay); the deploy now retries automatically with progressive backoff.

## 3.5
VPC creation from Settings: selecting **Create new VPC …** in the Default network dropdown opens a dialog to name and create a new VPC (auto subnets, global routing). The new network is auto-selected after creation. The dropdown no longer pre-selects a network on first load — the user must choose explicitly. Firewall rules, ACL, and Global Access are now scoped to the selected VPC. The project selector in the sidebar shows the key's custom display name when set. Key name always shown as a group header in the project selector dropdown.

## 3.4
Project Health widget: disabled APIs now show an **Enable** button. Clicking it enables the API directly from the app via the Service Usage API and auto-refreshes the health check when done. The service account key must have `serviceusage.services.enable` permission (included in the Scheduling group check).

## 3.3
New **Project Health** widget on the Settings page. Checks all IAM permissions required by the app (grouped by Instances, Images & Build, Network, DNS, and Scheduling) and verifies that all required GCP APIs are enabled. Runs automatically after a key is uploaded or the active project is switched; a manual refresh button is also available. Failing permission groups start expanded; passing groups are collapsed. Permissions are tested via `testIamPermissions` at the project level.

## 3.2
Cloud Run deploy automatically grants the compute service account access to the Cloud Build logs bucket as a new deploy step. Bucket-level IAM (`roles/storage.objectAdmin`) is tried first; if the service account key lacks the necessary permission, the step falls back to granting `roles/cloudbuild.builds.builder` at the project level via the Cloud Resource Manager API. Both paths are idempotent.

## 3.1
VPC network dropdown now refetches correctly after uploading or deleting a service account key, and after switching projects. A toast is shown when the service account does not have the `compute.networks.list` permission. Network query key includes the active project ID so switching projects always loads the correct VPC list.

## 3.0
Multi-VPC support (phase 1): a **Default network (GCP VPC)** dropdown is now shown in Preferences, listing all VPC networks in the active project. The `default` network is auto-selected on first load. A **Create new VPC** option is shown at the top of the list (no action behind it yet). Nav items are disabled when no network is configured, in addition to the existing no-key check. Build page disk size field now starts empty (shows `e.g. 200` as placeholder).

## 2.42
Configure page scrolls to the top when a job starts and stays there — log output now auto-scrolls within the panel instead of dragging the whole page down. All configure and SSH jobs now fail immediately with a clear error if the selected instance is not running. Fixed InstanceStatus.TERMINATED reference (correct name is STOPPED) in the license server conversion flow.

## 2.41
License server conversion now automatically renames the instance to `srv-{prepend}-{product}-001` (incrementing if already taken). The instance is powered down before the rename and restarted once the conversion is complete. Step 7 runs in parallel: static IP reservation, label update, firewall tag swap, and firewall rule creation all happen concurrently.

## 2.40
License server conversion now reserves a static internal IP as step 5 of 8 — the instance's current IP is promoted to a named GCP static address so the license server always keeps the same IP. When any instance with a static internal IP reservation is deleted from the app, the reservation is automatically released.

## 2.39
Teams notification cards now use a FactSet layout showing schedule name, status, job type, project, triggered by, start time, duration, and instance count. On failure, the last 5 log lines are shown as an error snippet. Added `speak` property to the Adaptive Card as an additional attempt to populate the Teams toast preview. Requires remote backend update.

## 2.38
Fix Teams toast notification showing "geen inhoud": add top-level `text` field alongside `summary` so the notification preview is populated correctly. Requires remote backend update.

## 2.37
Teams notification preview text (shown in the chat list and notification toast) now shows the schedule name and status instead of "dit bericht heeft geen voorbeeld". Requires remote backend update.

## 2.36
Fix Teams notifications not being sent from scheduled jobs: `teams_webhook_url` was missing from the settings snapshot, so the Cloud Run backend never had access to the webhook URL. The URL is now included in the snapshot at schedule creation and update time. Existing schedules must be re-saved (edit and save, or reschedule) to pick up the URL. Requires remote backend update.

## 2.35
Teams notification cards now show a green or red accent bar on the left based on job outcome. SSH job type now displays as "SSH" instead of "Ssh". Title updated to "Fabric Studio GCP Manager". Requires remote backend update.

## 2.34
Fix Teams notification not being sent after a scheduled job completes: `error_summary` was defined inside the Firestore `try` block, so any Firestore exception would silently prevent the notification from being sent. Requires remote backend update.

## 2.33
Teams webhook notifications now use the Adaptive Card format required by Power Automate Workflow webhooks (fixes "Property 'type' must be 'AdaptiveCard'" error). Schedule dialog overlay is now rendered via a React portal to fix a gap at the top of the page caused by the dialog being inside a scrollable container.

## 2.32
Developer documentation updates: Application Design doc updated with OpsContext, BuildContext, ImportContext, cloud_run router, version API endpoints, deploy stream hook, and teams_webhook_url setting. Scheduling Feature doc updated to reflect shipped status, SSH job type support, date/time picker dialog, reschedule replacing enable/disable, and corrected IAM permissions.

## 2.31
Cloud Run deploy and undeploy run as background jobs — navigating away during deploy/undeploy keeps the stream alive with a spinner on the Settings nav link; returning to Settings shows the live log. Dismissing a completed job on Build, Clone, Configure, and SSH pages now clears the log output and resets all form fields. SSH execute and test return an immediate error if no SSH key is configured in Settings. Documentation updates: Workshop Workflow rewrite, Configuration page (Import image section, License Server setup steps, Manual deploy corrections), Upgrade page (version indicator dots explained).

## 2.30
Documentation updates: Schedules (date/time picker, SSH job type, Preview/Reschedule actions, run history details), Images (inline rename with background job, inline family edit, delete confirmation), Costs, Settings (first-key auto-select behaviour, Scheduling field corrections).

## 2.29
Teams notifications via Microsoft Teams Workflow webhook — a notification is sent to a Teams channel when a scheduled job completes or fails. Settings layout reorganised: Preferences and Scheduling on the left, Service Account Keys, Notifications, and Appearance on the right.

## 2.28
Images: delete now uses an in-app confirmation dialog; rename runs as a background job with a live status banner; multiple concurrent renames supported with independent banners; rename state persists across navigation.

## 2.27
Configure, Clone, and SSH pages now show a status banner (running / done / failed) matching the Build page. Firewall: Source IP Allowlist creates the `workshop-source-networks` rule on first add and deletes it on last remove; Global Access creates/deletes the `workshop-source-any` rule; source tags column added to the All Rules table; rules sorted by priority ascending. Version check: uses ghcr.io image availability instead of the GitHub releases API.

## 2.26
Configure: added "This will be a new license server" option that converts an existing instance into a license server in 7 steps (uninstall Fabric runtime, delete fabrics, clear remote license server, enable built-in license service, update GCP labels, swap firewall tags, create license-server firewall rule). Fix hostname template `NameError` in bulk configure.

## 2.25
Version indicator redesign: two independent sidebar dots (local and remote), each coloured blue/green/orange based on sync and update status. Upgrade button now gated on GitHub release confirmation with polling. Docker build updated to Node.js 22; CI updated to Node.js 24. Doc links added to all page headers.

## 2.24
Upgrade button gated on GitHub release availability; polls every 5 seconds while waiting and shows "No new version available" until confirmed. GitHub version cache reduced from 1 hour to 60 seconds.

## 2.23
Version check: semantic comparison so that local > remote correctly suppresses the upgrade button. About popup polls `/version` every 10 seconds and stops polling during an active upgrade.

## 2.22
Near real-time schedule run log streaming: backend flushes log lines to Firestore every 2 seconds; frontend polls active runs every 2 seconds, auto-expands the running run, and auto-scrolls log output.

## 2.21
Retry with backoff on transient SSL/connection errors when creating instances from machine images — fixes parallel clone failures on cold-started Cloud Run.

## 2.20
Settings snapshot (admin password, DNS, SSH key, etc.) is pushed to the remote backend automatically after a Cloud Run upgrade.

## 2.19
Configure, Clone, and SSH jobs now stream output in the background with a nav spinner. Configure license server field is now an instance dropdown. Input validation added for registration tokens, passwords, and SSH keys. Schedules: human-readable cron preview added; legacy `template_id` field removed; date picker defaults to the current date and time.

## 2.18
Build form persists its values when navigating away during an active build and restores them on return. Disk extend API call removed — the OS now auto-expands LVM at first boot.

## 2.17
Fix all per-project settings fields (DNS, admin password, SSH key, owner, default_type, Cloud Run region, backend URL) being read from empty top-level `cfg.settings` instead of `get_project_config()` — broken since the 2.15 settings migration; affected DNS record creation, build labels, configure/shutdown password, SSH key injection, Cloud Scheduler region and backend URL. Build page: disk size (GB) field added, defaulting to 200, validated between 10 and 65536.

## 2.16
Image import fixes: GCS resumable upload CORS fixed (origin now derived from Referer/Host header instead of defaulting to localhost:5173); raw disk source converted from `gs://` to `https://` for the Compute API; `RawDisk` type corrected to `compute_v1.RawDisk`; closing the import dialog after completion resets state so reopening shows a fresh form.

## 2.15
Settings overhaul: preferences are now always stored per-project (never top-level); Preferences and Scheduling widgets are hidden when no key is configured; uploading the first key auto-selects its project without a dialog; uploading a duplicate key is rejected with a toast; deleting a key clears all associated project configs and scheduling settings. Cloud Run deploy improvements: Firestore database mode is now checked as a pre-flight condition (blocks deploy if in Datastore mode); the Firestore step hard-fails instead of warning; GCP cooldown after a recent database delete is handled with a retry and progress message; the deploy log stays visible after completion; the API enable step no longer shows a warning when APIs are already enabled (403 handling); the Cloud Run region field is no longer pre-populated with a default; disabling the Scheduling toggle clears and saves all scheduling settings immediately.

## 2.14
Fix Cloud Run upgrade failing with "Permission denied for Cloud Build" when switching to a different project: the upgrade now enables the Cloud Build API before attempting the image copy (the initial deploy always did this, but the upgrade path skipped it). The 403 error message now also distinguishes between an API-not-enabled error and a true IAM permission error.

## 2.13
Image import: upload a `disk-image.tar.gz` from the browser directly to a GCS staging bucket (auto-created with CORS), then create a GCP image via the raw disk API (OS adaptation skipped). Staging file deleted automatically after import. Import runs in the background — dialog is closable at any time with a status banner on the Images page; cancelling cleans up the staging file. Configure page license server field now validates IPv4 format.

## 2.12
Fix SSH schedules failing with "unknown job_type 'ssh'"; fix scheduled Configure/Clone jobs failing with "No admin password available" (fs_admin_password now read from per-project config via get_project_config() instead of the legacy top-level settings field).

## 2.11
SSL retry on GCP operation polling (fixes clone failures on slow connections); SSH page overhaul: instance picker matches Configure page, load internal/external IPs separately, scheduling auto-uses internal IPs with deduplication; Configure range from-field is now a free-text combobox; SSH schedule job type label fixed to "SSH".

## 2.10
Use external IP for all Fabric Studio API calls so DNS is no longer required; SSH scheduling (schedule SSH commands via Cloud Scheduler); firewall rule detail popup with GCP Console link; editable image description; rename disabled on running instances.

## 2.9
Replace enable/disable schedule toggle with a reschedule button (Calendar icon) that opens a date/time picker popup pre-filled from the existing cron expression; enable/disable routes removed from backend.

## 2.8
Fix Cloud Run upgrade: image is now copied to the project registry via Cloud Build before updating the service (previously failed with a missing image tag). Live upgrade log streams in the About popup with green/red status lines.

## 2.7
Settings auto-refresh after deploy so the Schedules nav item appears immediately without a manual save; schedule preview button (Eye icon) shows job parameters, cron, and creator; docs updated to describe UI-based Cloud Run upgrade.

## 2.6
Fix scheduled jobs failing with wrong Firestore project (`firestore_project_id` now read from per-project config); fix settings snapshot capturing empty password and DNS fields when using per-project settings (caused 401 on scheduled Configure jobs).

## 2.5
Fix schedules page not showing created schedules: all read routes (list, get, run history) now read directly from Firestore using the local service account key instead of proxying through Cloud Run.

## 2.4
Fix: remove invalid `prefer_rest` parameter from Firestore client calls, which caused all Firestore operations to fail with `Client.__init__() got an unexpected keyword argument 'prefer_rest'`.

## 2.3
Scheduling: named Firestore database (`fabricstudio-gcp-manager`) instead of `(default)` to avoid soft-delete conflicts; fix job run history composite index error (Python sort instead of Firestore order_by); fix local schedule reads; hide Schedules nav item when remote scheduling is disabled; deploy log stays visible after deployment completes; undeploy now cleans up Firestore schedules and job run history.

## 2.2
Update checker: sidebar dot and About popup show local/remote version sync status and GitHub update availability; one-click Cloud Run upgrade from About popup; Upgrade and Changelog pages added to docs.

## 2.1
Local/remote version display: sidebar dot (green = in sync, orange = out of sync) with tooltip; About popup shows local and remote versions, update availability, and links to release notes and upgrade guide.

## 2.0
Scheduling: automate Clone and Configure jobs via GCP Cloud Scheduler and Cloud Run; Firestore-backed schedule management and run history with live log streaming; manual trigger, enable/disable, run history with expandable log output.

## 1.12
Scheduling fixes: OIDC SA email, settings snapshot forwarding, triggered_by field, SF theme date picker, custom date/time picker, split Settings save buttons, sort schedules by date, live log flushing, internal IPs on Cloud Run, fix log line duplication.

## 1.11
Fix Cloud Scheduler job creation: use proto objects (scheduler_v1.Job/HttpTarget/OidcToken) instead of plain dicts.

## 1.10
Cloud Run region auto-detection; scheduling settings UI improvements (Detect button, GCP field labels); full scheduling documentation.

## 1.9
Fix /manual redirect; fix SPA catch-all intercepting docs; fix Docker TypeScript build error.

## 1.8
Docker support: Dockerfile, docker-compose, GitHub Actions workflow, SPA serving.

## 1.7
Documentation updates: corrected page docs for Firewall, Images, Costs, Labels, Configure, Clone, Workflow.

## 1.6
Documentation link in sidebar; mkdocs served at /manual with Security Fabric theme.

## 1.5
Shutdown auth retry dialog; license server via FS API only; Configure op reorder + task waits; bulk ops skip wrong-state instances; nav reorder.

## 1.4
Settings preferences moved left; Configure API call order matches UI; wait for registration task before fabric ops; friendly DNS error on template fetch.

## 1.3
Bulk start/stop/shutdown skip wrong-state instances; already running/stopped toasts.

## 1.2
Shutdown auth popup (skip/cancel/use-for-all); bulk bar clears immediately; LogStream fixed-height scrolling; Configure item reorder; label/hint text fixes.

## 1.1
Shutdown via Fabric Studio API with DNS cleanup; Clone/Labels half-width layout; toast grammar fixes.

## 1.0
Initial stable release. Multi-key GCP support, Configure page, SSH, Clone, Build, Costs, Firewall, Labels, Images, Schedules, Documentation.
