from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .constitution_verifier import verify_constitution
from .manifest import load_project_manifest
from .models import SessionBindingRecord
from .versioning import resolve_runtime_version

_PROFILE_BASELINES: dict[str, list[str]] = {
    "default": [],
    "sandbox": [],
    "research": [],
    "production": [],
}


class BindingError(Exception):
    def __init__(self, condition: str, detail: str) -> None:
        super().__init__(detail)
        self.condition = condition
        self.detail = detail


def resolve_effective_critical_actions(verification_profile: str, critical_actions: list[str]) -> list[str]:
    baseline = _PROFILE_BASELINES.get(verification_profile, [])
    return sorted(set([*baseline, *critical_actions]))


def bind_project(repo_root: Path) -> SessionBindingRecord:
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    effective = resolve_effective_critical_actions(
        manifest.verification_profile,
        manifest.critical_actions,
    )
    result = verify_constitution(repo_root)
    if result.hard_failed:
        raise BindingError(result.hard_failed, result.detail or "Constitution verification failed.")
    return SessionBindingRecord(
        session_id=f"sess-{uuid4().hex[:12]}",
        project_id=manifest.project_id,
        runtime_version=resolve_runtime_version(manifest.runtime_version),
        repo_root=str(repo_root),
        memory_namespace=manifest.memory_namespace,
        state="BOUND",
        effective_critical_actions=effective,
        bound_at=datetime.now(UTC),
        verification_passed=result.passed,
        verification_soft_failed=result.soft_failed,
        binding_degraded=bool(result.soft_failed),
    )
