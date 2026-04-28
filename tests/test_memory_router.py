from pathlib import Path

from context_os_runtime.memory_router import MemoryRoute, build_memory_route
from context_os_runtime.models import ProjectManifest


def test_build_memory_route_prefers_project_memory_and_separates_global_root(tmp_path: Path) -> None:
    manifest = ProjectManifest(
        project_id="brain-playground",
        domain_type="trading-research",
        runtime_version="0.1.x",
        memory_namespace="brain-playground",
        verification_profile="default",
    )

    route = build_memory_route(
        manifest=manifest,
        repo_root=tmp_path / "brain_playground",
        global_root=tmp_path / ".knowledge-brain",
    )

    assert isinstance(route, MemoryRoute)
    assert route.project_db_path.name == "knowledge.db"
    assert route.project_namespace == "brain-playground"
    assert route.global_db_path.parent.name == ".knowledge-brain"
