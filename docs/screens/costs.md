# Costs

View billing information and cost estimates for the active GCP project.

## Billing Account

If the service account has the **Billing Account Viewer** role, the Costs page shows the linked billing account name, account ID, and a link to open the full report in the GCP Billing Console.

If billing account access is not available, a notice is shown and cost estimates are still displayed — they use the GCP Cloud Billing Catalog API, which does not require billing account permissions.

If billing is not enabled for the project, a notice is shown instead.

## Running Instance Costs

A table of all currently running instances showing:

- **Instance** — instance name
- **Group** — value of the `group` label
- **Machine type**
- **Hourly**, **Daily**, **Monthly** — on-demand price estimates

A totals row at the bottom sums across all running instances.

!!! note
    Costs are on-demand estimates based on the GCP Cloud Billing Catalog API. Actual billing may differ due to sustained-use discounts, committed use contracts, or other adjustments.

## Cost per Workshop

Groups running instances by their `group` label and shows:

- **Instances** — number of instances in the group
- **Started** — earliest creation timestamp across instances in the group
- **Running** — how long the group has been running
- **Cost so far** — accrued cost since the group started
- **Scheduled deletion** — date/time of the linked delete schedule (if one exists)
- **Projected total** — estimated total cost from start to scheduled deletion

## Projected Monthly Cost

Four summary cards for the current calendar month:

- **Accrued this month** — cost already incurred by running instances since the start of the month
- **Remaining in month** — projected cost for the rest of the month at the current hourly rate
- **Scheduled workshops** — estimated cost of future clone+delete pairs scheduled this month
- **Projected total** — sum of the three above

## Dashboard widget

The **Cost Estimate** widget on the Dashboard shows the total hourly, daily, and monthly cost across all currently running instances, with a link to the full Costs page.
