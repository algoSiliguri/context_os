import re
from pathlib import Path

from context_os_runtime.binding import bind_project
from context_os_runtime.models import SessionBindingRecord


def test_bind_project_creates_session_binding_record(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: default",
            ]
        ),
        encoding="utf-8",
    )

    record = bind_project(repo_root)

    assert isinstance(record, SessionBindingRecord)
    assert record.project_id == "brain-playground"
    assert record.runtime_version == "0.1.0"
    assert record.state == "BOUND"


def test_bind_project_captures_critical_actions_and_session_id(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: production",
                "critical_actions:",
                "  - trade_execute",
                "  - global_memory_write",
            ]
        ),
        encoding="utf-8",
    )

    record = bind_project(repo_root)

    assert record.project_id == "brain-playground"
    assert re.fullmatch(r"sess-[0-9a-f]{12}", record.session_id)
    assert "trade_execute" in record.effective_critical_actions
    assert "deploy" in record.effective_critical_actions  # only from baseline
    assert "external_api_call" in record.effective_critical_actions  # only from baseline
    assert record.effective_critical_actions == sorted({"deploy", "external_api_call", "global_memory_write", "trade_execute"})
    assert record.state == "BOUND"
