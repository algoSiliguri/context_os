from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectManifest(BaseModel):
    project_id: str
    domain_type: str
    runtime_version: str
    memory_namespace: str
    verification_profile: str
    project_constitution: str | None = None
    global_memory_read: bool = True
    global_memory_write: bool = False
    critical_actions: list[str] = Field(default_factory=list)


class SessionBindingRecord(BaseModel):
    session_id: str
    project_id: str
    runtime_version: str
    repo_root: str
    memory_namespace: str
    state: str
    effective_critical_actions: list[str]
    bound_at: datetime
