from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from .models import ProjectManifest


class MemoryRoute(BaseModel):
    project_namespace: str
    project_db_path: Path
    global_db_path: Path
    global_memory_read: bool
    global_memory_write: bool


def build_memory_route(
    manifest: ProjectManifest,
    repo_root: Path,
    global_root: Path,
) -> MemoryRoute:
    return MemoryRoute(
        project_namespace=manifest.memory_namespace,
        project_db_path=repo_root / "data_store" / "knowledge.db",
        global_db_path=global_root / "knowledge.db",
        global_memory_read=manifest.global_memory_read,
        global_memory_write=manifest.global_memory_write,
    )
