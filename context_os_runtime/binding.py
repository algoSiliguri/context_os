from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .authority import verify_runtime_bundle
from .manifest import load_project_manifest
from .models import SessionBindingRecord
from .runtime_paths import runtime_dir
from .versioning import resolve_runtime_version

_PROFILE_BASELINES = {
    "default": [],
    "sandbox": [],
    "research": ["external_api_call", "global_memory_write"],
    "production": ["external_api_call", "global_memory_write", "trade_execute", "deploy"],
}


def bind_project(repo_root: Path) -> SessionBindingRecord:
    verify_runtime_bundle()
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    baseline = _PROFILE_BASELINES.get(manifest.verification_profile, [])
    effective = sorted(set([*baseline, *manifest.critical_actions]))
    return SessionBindingRecord(
        session_id=f"sess-{uuid4().hex[:12]}",
        project_id=manifest.project_id,
        runtime_version=resolve_runtime_version(manifest.runtime_version),
        repo_root=str(repo_root),
        runtime_dir=str(runtime_dir(repo_root)),
        memory_namespace=manifest.memory_namespace,
        state="BOUND",
        effective_critical_actions=effective,
        bound_at=datetime.now(UTC),
    )
