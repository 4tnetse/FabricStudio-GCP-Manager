import asyncio
import time
from functools import partial
from typing import Any

from google.cloud import compute_v1
from google.oauth2.service_account import Credentials

from models.firewall import FirewallRule
from models.instance import Instance, InstanceStatus


_TRANSIENT_ERRORS = ("SSL", "UNEXPECTED_EOF", "EOF occurred", "Max retries exceeded", "ConnectionError", "RemoteDisconnected")


def _wait_for_op(op, retries: int = 5, delay: int = 10) -> None:
    """Call op.result() with retries on transient SSL/connection errors.

    GCP operation polling uses long-lived HTTP connections that can drop with
    SSL EOF errors on slow operations (e.g. instance creation from machine image).
    The operation itself completes on the GCP side; we just need to re-poll.
    """
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            op.result()
            return
        except Exception as exc:
            msg = str(exc)
            if any(token in msg for token in _TRANSIENT_ERRORS):
                last_exc = exc
                if attempt < retries - 1:
                    time.sleep(delay)
                continue
            raise
    raise last_exc  # type: ignore[misc]


def _status_from_str(s: str) -> InstanceStatus:
    try:
        return InstanceStatus(s)
    except ValueError:
        return InstanceStatus.UNKNOWN


def _parse_instance(inst: Any, zone_name: str) -> Instance:
    """Convert a compute_v1.Instance object into our Instance model."""
    # Extract public and internal IPs
    public_ip: str | None = None
    internal_ip: str | None = None
    for nic in inst.network_interfaces or []:
        if nic.network_i_p:
            internal_ip = nic.network_i_p
        for ac in nic.access_configs or []:
            if ac.nat_i_p:
                public_ip = ac.nat_i_p

    # Strip the resource path from machine_type to get just the type name
    machine_type = inst.machine_type or ""
    if "/" in machine_type:
        machine_type = machine_type.rsplit("/", 1)[-1]

    # Extract tags (network tags)
    tags: list[str] = list(inst.tags.items) if inst.tags and inst.tags.items else []

    # Labels
    labels: dict[str, str] = dict(inst.labels) if inst.labels else {}

    # Boot disk size
    boot_disk_gb: int | None = None
    for disk in inst.disks or []:
        if disk.boot and disk.disk_size_gb:
            boot_disk_gb = disk.disk_size_gb
            break

    return Instance(
        name=inst.name,
        zone=zone_name,
        status=_status_from_str(inst.status),
        machine_type=machine_type,
        public_ip=public_ip,
        internal_ip=internal_ip,
        labels=labels,
        tags=tags,
        creation_timestamp=inst.creation_timestamp or None,
        boot_disk_gb=boot_disk_gb,
    )


def _parse_firewall(fw: Any) -> FirewallRule:
    allowed_list: list[dict] = []
    for a in fw.allowed or []:
        entry: dict = {"IPProtocol": a.I_p_protocol}
        if a.ports:
            entry["ports"] = list(a.ports)
        allowed_list.append(entry)

    return FirewallRule(
        name=fw.name,
        direction=fw.direction or "INGRESS",
        priority=fw.priority or 1000,
        source_ranges=list(fw.source_ranges) if fw.source_ranges else [],
        target_tags=list(fw.target_tags) if fw.target_tags else [],
        allowed=allowed_list,
        disabled=fw.disabled or False,
    )


class GCPComputeService:
    def __init__(self, credentials: Credentials, project_id: str):
        self._credentials = credentials
        self._project_id = project_id

    def _run(self, fn, *args, **kwargs):
        """Run a blocking call in the thread pool executor."""
        return asyncio.get_running_loop().run_in_executor(None, partial(fn, *args, **kwargs))

    # ------------------------------------------------------------------ #
    #  Instances                                                           #
    # ------------------------------------------------------------------ #

    async def list_instances(
        self, zone: str | None = None, filter_str: str | None = None
    ) -> list[Instance]:
        instances: list[Instance] = []

        if zone:
            client = compute_v1.InstancesClient(credentials=self._credentials)

            def _list():
                req = compute_v1.ListInstancesRequest(
                    project=self._project_id,
                    zone=zone,
                    filter=filter_str or "",
                )
                return list(client.list(request=req))

            raw = await self._run(_list)
            for inst in raw:
                instances.append(_parse_instance(inst, zone))
        else:
            client = compute_v1.InstancesClient(credentials=self._credentials)

            def _agg_list():
                req = compute_v1.AggregatedListInstancesRequest(
                    project=self._project_id,
                    filter=filter_str or "",
                )
                return list(client.aggregated_list(request=req))

            pages = await self._run(_agg_list)
            for zone_key, scoped_list in pages:
                zone_name = zone_key.replace("zones/", "")
                for inst in scoped_list.instances or []:
                    instances.append(_parse_instance(inst, zone_name))

        return instances

    async def get_instance(self, zone: str, name: str) -> Instance:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _get():
            return client.get(project=self._project_id, zone=zone, instance=name)

        inst = await self._run(_get)
        return _parse_instance(inst, zone)

    async def start_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _start():
            client.start(project=self._project_id, zone=zone, instance=name)

        await self._run(_start)

    async def stop_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _stop():
            client.stop(project=self._project_id, zone=zone, instance=name)

        await self._run(_stop)

    async def delete_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _delete():
            # Ensure all attached disks will be deleted with the instance
            inst = client.get(project=self._project_id, zone=zone, instance=name)

            # Honour delete-protection label
            labels = dict(inst.labels) if inst.labels else {}
            if labels.get("delete") == "no":
                raise ValueError(
                    f"Refusing to delete '{name}' — it has label delete=no."
                )

            for disk in inst.disks or []:
                if not disk.auto_delete:
                    op = client.set_disk_auto_delete(
                        project=self._project_id,
                        zone=zone,
                        instance=name,
                        auto_delete=True,
                        device_name=disk.device_name,
                    )
                    _wait_for_op(op)
            # Fire and don't wait — callers that need to wait use wait_until_deleted()
            client.delete(project=self._project_id, zone=zone, instance=name)

        await self._run(_delete)

    async def wait_until_deleted(self, zone: str, name: str, interval: float = 3.0, max_attempts: int = 30) -> None:
        """Poll until the instance no longer exists."""
        for _ in range(max_attempts):
            try:
                await self.get_instance(zone=zone, name=name)
                await asyncio.sleep(interval)
            except Exception:
                return  # Instance is gone

    async def set_machine_type(self, zone: str, name: str, machine_type: str) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)
        machine_type_url = (
            f"zones/{zone}/machineTypes/{machine_type}"
        )

        def _set():
            body = compute_v1.InstancesSetMachineTypeRequest(
                machine_type=machine_type_url
            )
            op = client.set_machine_type(
                project=self._project_id,
                zone=zone,
                instance=name,
                instances_set_machine_type_request_resource=body,
            )
            _wait_for_op(op)

        await self._run(_set)

    async def rename_instance(self, zone: str, name: str, new_name: str) -> None:
        """Rename an instance using the setName API."""
        client = compute_v1.InstancesClient(credentials=self._credentials)

        # We need the current fingerprint first
        def _get_and_rename():
            inst = client.get(project=self._project_id, zone=zone, instance=name)
            body = compute_v1.InstancesSetNameRequest(
                name=new_name,
                current_name=name,
            )
            op = client.set_name(
                project=self._project_id,
                zone=zone,
                instance=name,
                instances_set_name_request_resource=body,
            )
            _wait_for_op(op)

        await self._run(_get_and_rename)

    async def move_instance(self, zone: str, name: str, destination_zone: str) -> None:
        """Move an instance to another zone by creating a machine image then re-creating."""
        import uuid
        tmp_image_name = f"move-{name}-{uuid.uuid4().hex[:8]}"

        # Step 1: create machine image from current instance
        await self.create_machine_image(
            name=tmp_image_name,
            source_instance=name,
            source_zone=zone,
        )

        # Step 2: delete the original instance
        await self.delete_instance(zone=zone, name=name)

        # Step 3: create new instance from machine image in destination zone
        try:
            await self.create_instance_from_machine_image(
                name=name,
                machine_image=tmp_image_name,
                zone=destination_zone,
            )
        finally:
            # Step 4: clean up the temporary machine image
            try:
                await self.delete_machine_image(name=tmp_image_name)
            except Exception:
                pass

    async def add_tags(self, zone: str, name: str, tags: list[str]) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _add():
            inst = client.get(project=self._project_id, zone=zone, instance=name)
            current_tags = list(inst.tags.items) if inst.tags and inst.tags.items else []
            fingerprint = inst.tags.fingerprint if inst.tags else ""
            new_tags = list(set(current_tags) | set(tags))
            body = compute_v1.Tags(items=new_tags, fingerprint=fingerprint)
            op = client.set_tags(
                project=self._project_id,
                zone=zone,
                instance=name,
                tags_resource=body,
            )
            _wait_for_op(op)

        await self._run(_add)

    async def remove_tags(self, zone: str, name: str, tags: list[str]) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _remove():
            inst = client.get(project=self._project_id, zone=zone, instance=name)
            current_tags = list(inst.tags.items) if inst.tags and inst.tags.items else []
            fingerprint = inst.tags.fingerprint if inst.tags else ""
            new_tags = [t for t in current_tags if t not in tags]
            body = compute_v1.Tags(items=new_tags, fingerprint=fingerprint)
            op = client.set_tags(
                project=self._project_id,
                zone=zone,
                instance=name,
                tags_resource=body,
            )
            _wait_for_op(op)

        await self._run(_remove)

    async def add_labels(self, zone: str, name: str, labels: dict[str, str]) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _add():
            inst = client.get(project=self._project_id, zone=zone, instance=name)
            current_labels = dict(inst.labels) if inst.labels else {}
            fingerprint = inst.label_fingerprint or ""
            current_labels.update(labels)
            body = compute_v1.InstancesSetLabelsRequest(
                labels=current_labels,
                label_fingerprint=fingerprint,
            )
            op = client.set_labels(
                project=self._project_id,
                zone=zone,
                instance=name,
                instances_set_labels_request_resource=body,
            )
            _wait_for_op(op)

        await self._run(_add)

    async def remove_labels(self, zone: str, name: str, label_keys: list[str]) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _remove():
            inst = client.get(project=self._project_id, zone=zone, instance=name)
            current_labels = dict(inst.labels) if inst.labels else {}
            fingerprint = inst.label_fingerprint or ""
            for key in label_keys:
                current_labels.pop(key, None)
            body = compute_v1.InstancesSetLabelsRequest(
                labels=current_labels,
                label_fingerprint=fingerprint,
            )
            op = client.set_labels(
                project=self._project_id,
                zone=zone,
                instance=name,
                instances_set_labels_request_resource=body,
            )
            _wait_for_op(op)

        await self._run(_remove)

    # ------------------------------------------------------------------ #
    #  Firewall                                                            #
    # ------------------------------------------------------------------ #

    async def list_firewall_rules(self) -> list[FirewallRule]:
        client = compute_v1.FirewallsClient(credentials=self._credentials)

        def _list():
            return list(client.list(project=self._project_id))

        raw = await self._run(_list)
        return [_parse_firewall(fw) for fw in raw]

    async def get_firewall_rule(self, name: str) -> FirewallRule:
        client = compute_v1.FirewallsClient(credentials=self._credentials)

        def _get():
            return client.get(project=self._project_id, firewall=name)

        fw = await self._run(_get)
        return _parse_firewall(fw)

    async def set_firewall_disabled(self, rule_name: str, disabled: bool) -> None:
        client = compute_v1.FirewallsClient(credentials=self._credentials)

        def _update():
            body = compute_v1.Firewall(disabled=disabled)
            # Fire and don't wait — GCP processes async
            client.patch(
                project=self._project_id,
                firewall=rule_name,
                firewall_resource=body,
            )

        await self._run(_update)

    async def update_firewall_source_ranges(
        self, rule_name: str, source_ranges: list[str]
    ) -> None:
        client = compute_v1.FirewallsClient(credentials=self._credentials)

        def _update():
            body = compute_v1.Firewall(source_ranges=source_ranges)
            op = client.patch(
                project=self._project_id,
                firewall=rule_name,
                firewall_resource=body,
            )
            _wait_for_op(op)

        await self._run(_update)

    # ------------------------------------------------------------------ #
    #  Images                                                              #
    # ------------------------------------------------------------------ #

    async def list_images(self) -> list[dict]:
        client = compute_v1.ImagesClient(credentials=self._credentials)

        def _list():
            return list(client.list(project=self._project_id))

        raw = await self._run(_list)
        result = []
        for img in raw:
            result.append(
                {
                    "name": img.name,
                    "status": img.status,
                    "creation_timestamp": img.creation_timestamp,
                    "disk_size_gb": img.disk_size_gb,
                    "description": img.description or "",
                    "family": img.family or "",
                }
            )
        return result

    async def update_image_description(self, name: str, description: str) -> None:
        client = compute_v1.ImagesClient(credentials=self._credentials)

        def _patch():
            op = client.patch(
                project=self._project_id,
                image=name,
                image_resource=compute_v1.Image(description=description),
            )
            _wait_for_op(op)

        await self._run(_patch)

    async def import_image(self, name: str, gcs_uri: str, family: str = "", description: str = "") -> None:
        """Create a GCP image from a raw disk tar.gz in GCS (no OS adaptation)."""
        client = compute_v1.ImagesClient(credentials=self._credentials)

        def _insert():
            # Compute API requires https:// URL, not gs:// URI
            if gcs_uri.startswith("gs://"):
                https_source = "https://storage.googleapis.com/" + gcs_uri[5:]
            else:
                https_source = gcs_uri
            image = compute_v1.Image(name=name, raw_disk=compute_v1.RawDisk(source=https_source))
            if family:
                image.family = family
            if description:
                image.description = description
            op = client.insert(project=self._project_id, image_resource=image)
            _wait_for_op(op)

        await self._run(_insert)

    # ------------------------------------------------------------------ #
    #  Zones                                                               #
    # ------------------------------------------------------------------ #

    async def list_zones(self) -> list[str]:
        def _list():
            client = compute_v1.ZonesClient(credentials=self._credentials)
            return [z.name for z in client.list(project=self._project_id) if z.status == "UP"]
        return sorted(await self._run(_list))

    async def list_machine_types(self, zone: str) -> list[str]:
        def _list():
            client = compute_v1.MachineTypesClient(credentials=self._credentials)
            return [mt.name for mt in client.list(project=self._project_id, zone=zone)]
        return sorted(await self._run(_list))

    async def get_machine_type_specs(self, zone: str, machine_type: str) -> dict:
        """Return {vcpus, memory_gib} for the given machine type."""
        def _get():
            client = compute_v1.MachineTypesClient(credentials=self._credentials)
            mt = client.get(project=self._project_id, zone=zone, machine_type=machine_type)
            return {"vcpus": mt.guest_cpus, "memory_gib": mt.memory_mb / 1024.0}
        return await self._run(_get)

    # ------------------------------------------------------------------ #
    #  Machine Images                                                      #
    # ------------------------------------------------------------------ #

    async def create_machine_image(
        self, name: str, source_instance: str, source_zone: str
    ) -> None:
        client = compute_v1.MachineImagesClient(credentials=self._credentials)
        source_instance_url = (
            f"projects/{self._project_id}/zones/{source_zone}/instances/{source_instance}"
        )

        def _create():
            body = compute_v1.MachineImage(
                name=name,
                source_instance=source_instance_url,
            )
            op = client.insert(
                project=self._project_id,
                machine_image_resource=body,
            )
            _wait_for_op(op)

        await self._run(_create)

    async def delete_machine_image(self, name: str) -> None:
        client = compute_v1.MachineImagesClient(credentials=self._credentials)

        def _delete():
            op = client.delete(project=self._project_id, machine_image=name)
            _wait_for_op(op)

        await self._run(_delete)

    async def create_instance_from_machine_image(
        self, name: str, machine_image: str, zone: str
    ) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)
        machine_image_url = (
            f"projects/{self._project_id}/global/machineImages/{machine_image}"
        )

        def _create():
            req = compute_v1.InsertInstanceRequest(
                project=self._project_id,
                zone=zone,
                instance_resource=compute_v1.Instance(name=name),
                source_machine_image=machine_image_url,
            )
            op = client.insert(request=req)
            _wait_for_op(op)

        await self._run(_create)

    async def get_subnetwork_for_zone(self, zone: str) -> str | None:
        """Return the subnetwork URL for the given zone.

        Strategy:
        1. Look for an existing instance in the same zone.
        2. If none, look for an instance anywhere in the same region and
           rewrite the subnetwork URL to the target region.
        3. If still none, return None (GCP will use the default subnet).
        """
        region = zone.rsplit("-", 1)[0]
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _get():
            # Pass 1: same zone
            for inst in client.list(project=self._project_id, zone=zone):
                for nic in inst.network_interfaces or []:
                    if nic.subnetwork:
                        return nic.subnetwork

            # Pass 2: any instance in the project, prefer same region
            agg = client.aggregated_list(project=self._project_id)
            same_region, any_subnet = None, None
            for _zone_key, scoped in agg:
                for inst in scoped.instances or []:
                    for nic in inst.network_interfaces or []:
                        if nic.subnetwork:
                            any_subnet = nic.subnetwork
                            inst_region = nic.subnetwork.split("/regions/")[1].split("/")[0]
                            if inst_region == region:
                                same_region = nic.subnetwork
                                break
                    if same_region:
                        break
                if same_region:
                    break

            if same_region:
                return same_region
            if any_subnet:
                # Rewrite the region part to match the target region
                parts = any_subnet.split("/regions/")
                suffix = parts[1].split("/", 1)[1]  # e.g. "subnetworks/default"
                return f"{parts[0]}/regions/{region}/{suffix}"
            return None

        return await self._run(_get)

    # ------------------------------------------------------------------ #
    #  Build Instance                                                      #
    # ------------------------------------------------------------------ #

    async def build_instance(
        self,
        name: str,
        zone: str,
        machine_type: str,
        image: str,
        trial_key: str,
        labels: dict,
        tags: list[str],
        poc_definitions: list[str],
        poc_launch: str,
        subnetwork: str | None = None,
        disk_size_gb: int | None = None,
    ) -> None:
        client = compute_v1.InstancesClient(credentials=self._credentials)

        def _build():
            # Build metadata items
            metadata_items: list[compute_v1.Items] = []

            if trial_key:
                metadata_items.append(
                    compute_v1.Items(key="FPTRAILKEY", value=trial_key)
                )
            if poc_launch:
                metadata_items.append(
                    compute_v1.Items(key="POCLAUNCH", value=poc_launch)
                )
            for idx, poc_def in enumerate(poc_definitions[:8], start=1):
                if poc_def:
                    metadata_items.append(
                        compute_v1.Items(key=f"POCDEFINITION{idx}", value=poc_def)
                    )

            disk_source_image = (
                f"projects/{self._project_id}/global/images/{image}"
            )
            instance_body = compute_v1.Instance(
                name=name,
                machine_type=f"zones/{zone}/machineTypes/{machine_type}",
                disks=[
                    compute_v1.AttachedDisk(
                        boot=True,
                        auto_delete=True,
                        initialize_params=compute_v1.AttachedDiskInitializeParams(
                            source_image=disk_source_image,
                            **( {"disk_size_gb": disk_size_gb} if disk_size_gb else {} ),
                        ),
                    )
                ],
                network_interfaces=[
                    compute_v1.NetworkInterface(
                        subnetwork=subnetwork,
                        access_configs=[
                            compute_v1.AccessConfig(
                                name="External NAT",
                                type_="ONE_TO_ONE_NAT",
                            )
                        ]
                    )
                ],
                labels=labels,
                tags=compute_v1.Tags(items=tags) if tags else None,
                metadata=compute_v1.Metadata(items=metadata_items) if metadata_items else None,
            )

            op = client.insert(
                project=self._project_id,
                zone=zone,
                instance_resource=instance_body,
            )
            _wait_for_op(op)

        await self._run(_build)
