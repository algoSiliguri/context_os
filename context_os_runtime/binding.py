from __future__ import annotations

from pathlib import Path

from .manifest import load_project_manifest
from .models import SessionBindingRecord
from .versioning import resolve_runtime_version


def bind_project(repo_root: Path) -> SessionBindingRecord:
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    return SessionBindingRecord(
        project_id=manifest.project_id,
        runtime_version=resolve_runtime_version(manifest.runtime_version),
        repo_root=str(repo_root),
        memory_namespace=manifest.memory_namespace,
        state="BOUND",
    )
