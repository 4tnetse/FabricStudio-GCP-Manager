from pydantic import BaseModel


class FirewallRule(BaseModel):
    name: str
    direction: str
    priority: int
    source_ranges: list[str]
    target_tags: list[str]
    allowed: list[dict]
    disabled: bool = False


class IpAclRequest(BaseModel):
    ip_address: str | None = None  # None = auto-detect caller's IP


class TagRequest(BaseModel):
    tag: str


class TagReplaceRequest(BaseModel):
    old_tag: str
    new_tag: str
