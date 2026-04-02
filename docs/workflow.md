# Workshop Workflow

This page describes the recommended end-to-end workflow for setting up and delivering a Fabric Studio workshop on GCP.

## 1. Initial setup

Complete the [first-time configuration](configuration.md) in Settings before doing anything else.

To continue from here you should already have a [Fabric Studio GCP image imported](configuration.md#import-the-fabric-studio-gcp-image) and a running Fabric Studio license server.

## 2. Build a workshop golden image

Go to **Build** and create the `000` instance — this is your golden workshop image.  
You can reuse it fo several workshops or create a new golden image for each workshop.

- Set your **initials** and a **workshop name**. The instance will be named `<instance prefix>-<initials>-<workshop>-000`. (the instance prefix is configured in the Settings page)  
- Select a **zone**, **machine type**, and **image**.  
- Click **Build** and watch the live output.

The build process will automatically add these labels: `delete=no` and `purpose=golden_image`.

## 3. Configure the workshop golden image

Go to **Configure** and select the `000` instance.

- Set the admin password (if different from the default in Settings).  
- Enter a **registration token** to register Fabric Studio.  
- Add additional SSH public keys if needed.  
- Select the **license server**.
- Set a **guest password**.
- Set a **Hostname**. Note: if you want to use `{count}`, you need to set the hostname after cloning.
- Configure the **Fabric Workspace(s)**.

## 4. Clone to workshop attendee instances

Once the workshop golden image is configured, go to **Clone**:

- Select the `000` instance as source.  
- Set the **Workshop name**.  
- Set the **Customer, Partner or Event** label.  
- Choose the **Destination zone**.  
- Set the **clone range** (e.g. 1 to 20 for 20 attendees).  
- Click **Clone**. Instances are created in batches of 5.

## 5. Verify instances

Go to **Instances** to verify all cloned instances are running. Use the status summary cards at the top to see totals at a glance.

## 6. Set the hostnames (optional)

Go to **Configure** and select all workshop instances:

- Set the **Hostname**. e.g. `Attendee - {count}`  
- leave the rest as is and click **Configure**.

## 7. Run commands via SSH (optional)

Use the **SSH** page to execute commands across all instances simultaneously:

- Select instances by name or range.
- Enter a command manually or select a saved **configuration file**.  
- Choose **parallel** (all at once) or **sequential** (one at a time) execution mode.

## 8. Clean up after the workshop

When you want to reuse the instances (e.g. same workshop day, different labs):

Use **Configure** to:

- Reset the **guest password**.
- Reconfigure the **Fabric Workspace(s)**.

When the workshop is done:

- Use **Instances → Bulk Stop** to stop all instances and avoid unnecessary costs.  
- Use **Instances → Bulk Delete** to remove instances that are no longer needed.  
- Check **Costs** to verify billing is as expected.
