# Fabric Studio GCP Manager

Fabric Studio GCP Manager is a web-based management interface for deploying, configuring, and managing Fabric Studio instances on Google Cloud Platform, designed to streamline workshop delivery.

## Features

| Page | Description |
|---|---|
| **Instances** | Overview of all GCP instances with status summary, filtering, bulk actions, and detailed instance info. |
| **Build** | Create a new Fabric Studio workshop golden image from scratch. |
| **Configure** | Bulk-configure instances: passwords, SSH keys, registration token, license server, hostname, and Fabric Workspace templates. |
| **Clone** | Bulk-clone a workshop golden image to multiple instances with custom naming and destination zone. |
| **Firewall** | View and manage GCP firewall rules needed for your workshops. |
| **Labels** | Add and remove GCP labels on any instance. |
| **SSH** | Execute commands across multiple instances simultaneously with live streaming output. |
| **SSH Configurations** | Create and edit files containing CLI commands for reuse in the SSH page. |
| **Images** | Upload and manage your Fabric Studio machine images. |
| **Costs** | View current-month cost summary for the active GCP project. |
| **Schedules** | Schedule Clone, Configure and SSH jobs, with run history and live log output. |
| **Settings** | Manage GCP service account keys, project settings, notifications and UI theme. |
