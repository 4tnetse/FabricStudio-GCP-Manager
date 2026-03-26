# Firewall

View and manage GCP firewall rules and access controls for the active project.

## Source IP Allowlist

Manage a list of allowed source IP addresses for workshop access.

- Click **Add** to add an IP manually, or click **Detect** to auto-detect your current public IP.
- Click the delete button next to an IP to remove it from the allowlist.

## Global Access

Toggle global access on or off.

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
| **Target Tags** | GCP network tags targeted by the rule |
| **Status** | Enabled or disabled |

Firewall rules are read from the GCP Compute Engine API for the active project.
