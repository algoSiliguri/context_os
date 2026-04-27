from __future__ import annotations

from pydantic import BaseModel


class ProjectManifest(BaseModel):
    project_id: str
    domain_type: str
    runtime_version: str
    memory_namespace: str
    verification_profile: str
    project_constitution: str | None = None
    global_memory_read: bool = True
    global_memory_write: bool = False
