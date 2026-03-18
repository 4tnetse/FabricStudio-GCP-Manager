import asyncio
from functools import partial

from google.cloud import dns


class GCPDnsService:
    def __init__(self, credentials, project_id: str) -> None:
        self._credentials = credentials
        self._project_id = project_id

    def _run(self, fn, *args, **kwargs):
        return asyncio.get_running_loop().run_in_executor(None, partial(fn, *args, **kwargs))

    async def upsert_a_record(
        self,
        zone_name: str,
        fqdn: str,
        public_ip: str,
        ttl: int = 300,
    ) -> None:
        """Create or replace an A record in the given managed zone."""
        # Ensure FQDN ends with a dot (required by Cloud DNS)
        if not fqdn.endswith("."):
            fqdn = fqdn + "."

        def _upsert():
            client = dns.Client(project=self._project_id, credentials=self._credentials)
            zone = client.zone(zone_name)

            new_record = zone.resource_record_set(fqdn, "A", ttl, [public_ip])

            # Find and remove any existing A record for this name
            existing = list(zone.list_resource_record_sets())
            old_record = next(
                (r for r in existing if r.name == fqdn and r.record_type == "A"),
                None,
            )

            changes = zone.changes()
            if old_record:
                changes.delete_record_set(old_record)
            changes.add_record_set(new_record)
            changes.create()

        await self._run(_upsert)

    async def delete_a_record(self, zone_name: str, fqdn: str) -> None:
        """Delete an A record from the given managed zone if it exists."""
        if not fqdn.endswith("."):
            fqdn = fqdn + "."

        def _delete():
            client = dns.Client(project=self._project_id, credentials=self._credentials)
            zone = client.zone(zone_name)

            existing = list(zone.list_resource_record_sets())
            old_record = next(
                (r for r in existing if r.name == fqdn and r.record_type == "A"),
                None,
            )
            if old_record:
                changes = zone.changes()
                changes.delete_record_set(old_record)
                changes.create()

        await self._run(_delete)
