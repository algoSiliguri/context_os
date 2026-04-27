from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from colorama import Fore, Style
from knowledge_brain.approval_store import ApprovalStore

from context_os_runtime.approval import derive_action_status
from context_os_runtime.cli import (
    approve_command,
    bind_command,
    deny_command,
    render_status_view,
    status_snapshot,
    watch_status,
)
from context_os_runtime.events import append_event
from context_os_runtime.interceptor import request_critical_action
from context_os_runtime.lock import read_lock


def _write_manifest(repo_root: Path) -> None:
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: production",
                "global_memory_read: true",
                "global_memory_write: false",
                "critical_actions:",
                "  - trade_execute",
                "  - global_memory_write",
            ]
        ),
        encoding="utf-8",
    )


def test_bind_command_writes_lock_for_active_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    record = bind_command(repo_root=repo_root)
    lock = read_lock(repo_root / ".agent-os.lock")
    events = (repo_root / ".agent-os" / "events.jsonl").read_text(encoding="utf-8")

    assert lock.session_id == record.session_id
    assert lock.project_id == "brain-playground"
    assert "SESSION_BOUND" in events


def test_approve_command_rejects_detached_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    with pytest.raises(RuntimeError, match="Cannot approve in a detached session"):
        approve_command(repo_root=repo_root, action_hash="hash-1", approver_meta={"actor": "human"})


def test_deny_command_rejects_detached_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    with pytest.raises(RuntimeError, match="Cannot approve in a detached session"):
        deny_command(repo_root=repo_root, action_hash="hash-1", reason="human_declined")


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


def test_status_snapshot_reports_active_pending_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)

    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    snapshot = status_snapshot(repo_root=repo_root)
    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )

    assert snapshot.active is True
    assert snapshot.mode == "ACTIVE"
    assert snapshot.canonical_state == "AWAITING_APPROVAL"
    assert snapshot.current_action_hash == action_hash
    assert snapshot.projection_state == "PENDING"
    assert projection is not None
    assert projection.final_status == "PENDING"


def test_status_snapshot_falls_back_to_detached_recent_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )
    (repo_root / ".agent-os.lock").unlink()

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.active is False
    assert snapshot.mode == "DETACHED"
    assert snapshot.canonical_state == "AWAITING_APPROVAL"
    assert snapshot.session_id == binding.session_id


def test_render_status_view_highlights_active_and_detached_states(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    active_view = render_status_view(status_snapshot(repo_root=repo_root), use_color=True)
    assert "ACTIVE SESSION" in active_view
    assert Fore.YELLOW in active_view
    assert action_hash in active_view

    (repo_root / ".agent-os.lock").unlink()
    detached_view = render_status_view(status_snapshot(repo_root=repo_root), use_color=True)
    assert "DETACHED SESSION" in detached_view
    assert Style.DIM in detached_view


def test_approve_command_mirrors_projection_and_unlocks_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    approve_command(repo_root=repo_root, action_hash=action_hash, approver_meta={"actor": "human"})

    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )
    snapshot = status_snapshot(repo_root=repo_root)

    assert projection is not None
    assert projection.final_status == "APPROVED"
    assert snapshot.projection_state == "APPROVED"


def test_deny_command_marks_projection_denied(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    deny_command(repo_root=repo_root, action_hash=action_hash, reason="human_declined")

    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )
    snapshot = status_snapshot(repo_root=repo_root)

    assert projection is not None
    assert projection.final_status == "DENIED"
    assert snapshot.canonical_state == "IDLE"


def test_watch_status_clears_terminal_and_renders_snapshot(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)

    stream = io.StringIO()
    stream.isatty = lambda: False  # type: ignore[attr-defined]
    watch_status(repo_root=repo_root, stream=stream, interval_seconds=0, iterations=1)

    output = stream.getvalue()
    assert "\033[2J\033[H" in output
    assert "ACTIVE SESSION" in output


def test_watch_status_handles_keyboard_interrupt_cleanly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)

    stream = io.StringIO()
    stream.isatty = lambda: False  # type: ignore[attr-defined]

    def _boom(_seconds: float) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr("context_os_runtime.cli.time.sleep", _boom)

    watch_status(repo_root=repo_root, stream=stream, interval_seconds=2, iterations=None)
