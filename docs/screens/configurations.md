# SSH Configurations

Create and manage configuration files containing Fabric Studio CLI commands for reuse in the SSH screen.

## Creating a file

1. Click the **+** button in the file list header.
2. Enter a filename in the editor header (e.g. `my-commands.conf`). The `.conf` extension is added automatically if omitted.
3. Enter commands in the editor.
4. Click **Save**.

## Editing a file

1. Select a file from the left panel.
2. Edit the content in the right panel.
3. Click **Save** when done.

## Deleting a file

Click the trash icon in the editor header. The `example.conf` file cannot be deleted.

## File format

Each line is treated as a separate command. Lines starting with `#` are treated as comments and are ignored during execution.

```
# This is a comment
get system status
get system performance status
```

Add a sleep timer by adding `;sleep x` after a command line.


## Usage in SSH

Configuration files appear in the **Configuration file** dropdown on the [SSH](ssh.md) screen. Selecting a file disables the manual command field and uses the file's commands instead.
