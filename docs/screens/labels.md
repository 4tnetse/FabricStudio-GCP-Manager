# Labels

Add and remove GCP labels on any instance.

## Usage

1. Select an instance from the searchable dropdown (zone is shown next to each name).
2. Existing labels are loaded and shown as key = value pairs.
3. Click the trash icon next to a label to remove it — applied immediately.
4. Enter a key and value and click **Add** (or press Enter) to add a new label — applied immediately.
5. To update an existing label, add a new label with the same key — the value will be overwritten.

All changes are applied directly to GCP — there is no Save button.

## Label format

GCP label keys and values must:

- Contain only lowercase letters, digits, underscores, and hyphens
- Be at most 63 characters long

## Notes

The Labels page can also be opened directly from the **Instances** page via the **Edit Labels** row action.
