from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from context_os_runtime.approval import derive_action_status
from context_os_runtime.cli import approve_command, deny_command, main
from context_os_runtime.events import append_event


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


def test_projection_history_does_not_unlock_new_session(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(
        log_path,
        {
            "session_id": "sess-new",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "ACTION_REQUESTED",
            "action_hash": "hash-1",
            "capability": "trade_execute",
            "params_digest_source": '{"ticker":"BTC","size":1.0}',
            "requested_at": datetime.now(UTC).isoformat(),
            "expires_at": (datetime.now(UTC) + timedelta(seconds=30)).isoformat(),
        },
    )

    status = derive_action_status(log_path, session_id="sess-new", action_hash="hash-1")

    assert status.executable is False
    assert status.final_status == "PENDING"


def test_bind_command_creates_lock_and_runtime_layout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: sample-project",
                "domain_type: generic-software",
                "runtime_version: 0.1.x",
                "memory_namespace: sample-project",
                "verification_profile: default",
            ]
        ),
        encoding="utf-8",
    )

    cwd = Path.cwd()
    try:
        import os

        os.chdir(repo_root)
        main(["bind"])
    finally:
        os.chdir(cwd)

    out = capsys.readouterr().out
    assert "ACTIVE canonical=BOUND" in out
    assert (repo_root / ".agent-os.lock").exists()
    assert (repo_root / ".agent-os" / "runtime" / "events.jsonl").exists()
    assert (repo_root / ".agent-os" / "runtime" / "session.json").exists()


def test_deny_command_rejects_detached_session(tmp_path: Path) -> None:
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

    with pytest.raises(RuntimeError, match="Cannot deny in a detached session"):
        deny_command(repo_root=repo_root, action_hash="hash-1", reason="unsafe")


def test_status_reports_active_bound_session(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: sample-project",
                "domain_type: generic-software",
                "runtime_version: 0.1.x",
                "memory_namespace: sample-project",
                "verification_profile: default",
            ]
        ),
        encoding="utf-8",
    )

    cwd = Path.cwd()
    try:
        import os

        os.chdir(repo_root)
        main(["bind"])
        capsys.readouterr()
        main(["status"])
    finally:
        os.chdir(cwd)

    out = capsys.readouterr().out
    assert "ACTIVE canonical=BOUND" in out


def test_status_reconstructs_detached_session_from_event_log(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo_root = tmp_path / "repo"
    runtime_dir = repo_root / ".agent-os" / "runtime"
    runtime_dir.mkdir(parents=True)
    (runtime_dir / "events.jsonl").write_text(
        '{"event_type": "BINDING", "project_id": "sample-project", "runtime_version": "0.1.0", "session_id": "sess-1", "state": "BOUND", "timestamp": "2026-04-28T00:00:00+00:00"}\n',
        encoding="utf-8",
    )

    cwd = Path.cwd()
    try:
        import os

        os.chdir(repo_root)
        main(["status"])
    finally:
        os.chdir(cwd)

    out = capsys.readouterr().out
    assert "DETACHED canonical=BOUND" in out
