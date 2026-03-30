# Changelog

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
