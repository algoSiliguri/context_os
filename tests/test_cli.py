from pathlib import Path

import pytest

from context_os_runtime.cli import approve_command


def test_approve_command_rejects_detached_session(tmp_path: Path) -> None:
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
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="Cannot approve in a detached session"):
        approve_command(repo_root=repo_root, action_hash="hash-1", approver_meta={"actor": "human"})
