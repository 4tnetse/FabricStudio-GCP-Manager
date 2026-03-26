# Build

Create a new Fabric Studio golden image on GCP.

## Fields

| Field | Required | Description |
|---|---|---|
| **Prepend (your initials)** | Yes | Short identifier prepended to the instance name (e.g. `tve`) |
| **Workshop name** | Yes | Name of the workshop (e.g. `partner-hol`) |
| **Zone** | Yes | GCP zone where the instance will be created |
| **Machine type** | Yes | VM machine type; loaded dynamically based on the selected zone |
| **Image** | Yes | Boot disk image to use |
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

## Notes

- Machine types are loaded dynamically after selecting a zone.
- The `delete: no` label is automatically applied to protect the golden image from accidental deletion during clone operations.
