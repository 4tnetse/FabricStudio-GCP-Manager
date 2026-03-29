# Workflow

This page describes the recommended end-to-end workflow for setting up and delivering a Fabric Studio workshop on GCP.

## 1. Initial setup

Complete the [first-time configuration](configuration.md) in Settings before doing anything else:

- Upload your GCP service account key  
- Set your SSH public key, default zone, and admin password  
- Configure DNS settings if you want automatic DNS records

## 2. Build a workshop golden image

Go to **Build** and create the `000` instance — this is your golden workshop image.  
You can reuse it fo several workshops or create a new golden image for each workshop.

- Set your **initials** and a **workshop name**. The instance will be named `<instance prefix>-<initials>-<workshop>-000`. (the instance prefix is configured in the Settings page)  
- Select a **zone**, **machine type**, and **image**.  
- Click **Build** and watch the live output.

## 3. Configure the golden image

Go to **Configure** and select the `000` instance.

- Set the admin password (if different from the default in Settings).  
- Enter a **registration token** to register Fabric Studio.  
- Add additional SSH public keys if needed.  
- Set the **license server internal IP address**.  
- Set a guest password, and Fabric Workspace templates.  
- Click **Configure** and wait for the output to complete.

## 4. Clone to workshop attendee instances

Once the golden image is configured, go to **Clone**:

- Select the `000` instance as source.  
- Set the **Workshop name**.  
- Set the **Customer, Partner or Event** label.  
- Choose the **Destination zone**.  
- Set the **clone range** (e.g. 1 to 20 for 20 attendees).  
- Click **Clone**. Instances are created in batches of 5.

## 5. Verify instances

Go to **Instances** to verify all cloned instances are running. Use the status summary cards at the top to see totals at a glance.

## 6. Configure workshop instances

Go to **Configure** and select all workshop instances:

- Set the **Hostname**. e.g. `Attendee - {count}`  
- leave the rest as is and click **Configure**.

## 7. Run commands via SSH (optional)

Use the **SSH** page to execute commands across all instances simultaneously:

- Select instances by name, range, or load all public IPs.  
- Enter a command manually or select a saved **configuration file**.  
- Choose **parallel** (all at once) or **sequential** (one at a time) execution mode.

## 8. Clean up after the workshop

When the workshop is done:

- Use **Instances → Bulk Stop** to stop all instances and avoid unnecessary costs.  
- Use **Instances → Bulk Delete** to remove instances that are no longer needed.  
- Check **Costs** to verify billing is as expected.
