# Costs

View billing information and cost summary for the active GCP project.

The Costs page shows the **Billing Account** linked to the active project, including the account name, account ID, and a link to open the full report in the GCP Billing Console.

!!! note
    Access to billing data requires the service account to have the **Billing Account Viewer** role on the billing account.

!!! info
    Detailed cost breakdowns are not available via the GCP Billing API. Use the link to the GCP Billing Console to view per-service and per-resource usage.

If the service account does not have billing permissions, a warning is shown with a link to the GCP Billing Console. If billing is not enabled for the project, a notice is shown instead.
