# Firewall

View and manage GCP firewall rules and access controls for the active project.

## Source IP Allowlist

Manages the `workshop-source-networks` GCP firewall rule — a list of allowed source IP addresses for workshop access.

- Type an IP or CIDR range (e.g. `203.0.113.0/24`) and click **Add** (or press Enter), or click **Detect** to auto-detect your current public IP.
- Click the trash icon next to an IP to remove it from the allowlist.

## Global Access

Toggles the `workshop-source-any` GCP firewall rule — allows all source IPs.

| State | Behaviour |
|---|---|
| **Disabled** | Only IPs in the Source IP Allowlist are allowed |
| **Enabled** | The whole Internet is allowed (not advised) |

## All Firewall Rules

Lists all firewall rules in the project with the following columns:

| Column | Description |
|---|---|
| **Name** | Firewall rule name |
| **Direction** | Ingress or egress |
| **Priority** | Rule priority (lower = higher priority) |
| **Source Ranges** | Source IP ranges the rule applies to |
| **Source Tags** | GCP network tags used as traffic source |
| **Target Tags** | GCP network tags targeted by the rule |
| **Status** | Active or disabled |

Click any row to open a detail popup with the full rule information including allowed protocols and ports.

Firewall rules are read from the GCP Compute Engine API for the active project.
