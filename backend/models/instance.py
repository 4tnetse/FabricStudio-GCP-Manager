from enum import Enum

from pydantic import BaseModel


class InstanceStatus(str, Enum):
    RUNNING = "RUNNING"
    STOPPED = "TERMINATED"
    STAGING = "STAGING"
    STOPPING = "STOPPING"
    PROVISIONING = "PROVISIONING"
    UNKNOWN = "UNKNOWN"


class Instance(BaseModel):
    name: str
    zone: str
    status: InstanceStatus
    machine_type: str
    public_ip: str | None
    internal_ip: str | None
    labels: dict[str, str]
    tags: list[str]
    creation_timestamp: str | None
    boot_disk_gb: int | None = None


class BuildConfig(BaseModel):
    prepend: str
    product: str
    zone: str
    machine_type: str = "n1-standard-4"
    image: str
    trial_key: str = ""
    group: str = ""
    poc_definitions: list[str] = []  # up to 8
    poc_launch: str = ""
    license_server: str = ""
    labels: dict[str, str] = {}
    count_start: int = 1
    count_end: int = 1
    title: str = ""


class CloneRequest(BaseModel):
    source_name: str  # the 000 instance name e.g. "fs-tve-fwb-000"
    zone: str         # zone of the source instance
    target_zone: str | None = None   # destination zone; defaults to zone if None
    clone_base_name: str | None = None  # custom base name for clones e.g. "my-workshop"; defaults to source base name
    purpose: str | None = None          # value for the 'purpose' label on cloned instances
    count_start: int = 1
    count_end: int = 1
    overwrite: bool = False  # if True, delete existing instance before cloning; if False, skip


class MachineTypeRequest(BaseModel):
    machine_type: str


class RenameRequest(BaseModel):
    new_name: str


class MoveRequest(BaseModel):
    destination_zone: str


class GlobalAccessRequest(BaseModel):
    enabled: bool
