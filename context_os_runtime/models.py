from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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

    @field_validator("critical_actions")
    @classmethod
    def validate_critical_actions(cls, value: list[str]) -> list[str]:
        if any(not action.strip() for action in value):
            raise ValueError("critical actions must not contain blanks")
        return value


class SessionBindingRecord(BaseModel):
    session_id: str
    project_id: str
    runtime_version: str
    repo_root: str
    runtime_dir: str
    memory_namespace: str
    state: str
    effective_critical_actions: list[str]
    bound_at: datetime
    verification_passed: list[str] = Field(default_factory=list)
    verification_soft_failed: list[str] = Field(default_factory=list)
    binding_degraded: bool = False
