# Build

Create a new Fabric Studio workshop golden image.

## Fields

| Field | Required | Description |
|---|---|---|
| **Prepend (your initials)** | Yes | Short identifier prepended to the instance name (e.g. `tve`) |
| **Workshop name** | Yes | Name of the workshop (e.g. `partner-hol`) |
| **Zone** | Yes | GCP zone where the instance will be created |
| **Machine type** | Yes | VM machine type; loaded dynamically based on the selected zone |
| **Image** | Yes | Boot disk image to use |
| **Disk size (GB)** | No | Boot disk size in GB (10–65536). Defaults to 200. Leave blank to use the image's default size. |
| **Group** | No | Optional group label applied to the instance |
| **Additional labels** | No | Any extra GCP labels (key = value pairs) |

## Instance name preview

As you fill in **Prepend** and **Workshop name**, a live preview of the instance name appears:

```
<instance prefix>-<initials>-<workshop>-000
```

The `<instance prefix>` is taken from the **Settings** page.
The `000` suffix marks this as the golden image.

## Output panel

The right panel streams live build output once the build is started.

You can navigate to other pages while a build is in progress — it continues running in the background. When you return to the Build page, a status banner shows the current state (building / completed / failed) and the form is restored with the values used for that build. The form is locked while the build is running.

## Post-build automation

After the instance is created and running, the build job automatically performs the following steps if configured:

1. **DNS record** — creates an A record for the instance (requires DNS settings in Settings). DNS failure is logged as a warning but does not stop the build.
2. **Initial password setup** — logs in to the Fabric Studio API with the default empty password and sets it to the **Default admin password** configured in Settings. Skipped if no admin password is configured.

The Fabric Studio OS automatically expands the LVM to fill the provisioned disk at first boot, so no manual disk extension step is required.

## Notes

- Machine types are loaded dynamically after selecting a zone.
- The `delete: no` label is automatically applied to protect the golden image from accidental deletion during clone operations.
- Import a Fabric Studio image first via the **Images** page before building.
