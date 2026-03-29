# Changelog

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
