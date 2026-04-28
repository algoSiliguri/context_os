from datetime import UTC, datetime, timedelta
from pathlib import Path

from context_os_runtime.approval import derive_action_status
from context_os_runtime.events import append_event
from context_os_runtime.interceptor import compute_action_hash, guard_memory_write


def test_compute_action_hash_is_deterministic() -> None:
    h1 = compute_action_hash("trade_execute", {"ticker": "BTC", "size": 1.0})
    h2 = compute_action_hash("trade_execute", {"ticker": "BTC", "size": 1.0})
    assert h1 == h2
    assert len(h1) == 16


def test_guard_memory_write_allows_matching_namespace(tmp_path: Path) -> None:
    allowed = guard_memory_write(
        session_id="sess-1",
        action_hash="hash-1",
        requested_namespace="brain-playground",
        allowed_namespace="brain-playground",
        global_writes_enabled=False,
        log_path=tmp_path / "events.jsonl",
    )
    assert allowed is True


def test_guard_memory_write_blocks_global_and_logs_permission_denied(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    allowed = guard_memory_write(
        session_id="sess-1",
        action_hash="hash-2",
        requested_namespace="global",
        allowed_namespace="brain-playground",
        global_writes_enabled=False,
        log_path=log_path,
    )
    assert allowed is False
    contents = log_path.read_text(encoding="utf-8")
    assert "PERMISSION_DENIED" in contents
    assert "SECURITY_VIOLATION" not in contents
    assert "global_memory_write_blocked" in contents


def test_expired_request_is_forced_back_to_idle(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(
        log_path,
        {
            "session_id": "sess-123",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "ACTION_REQUESTED",
            "action_hash": "hash-ttl",
            "capability": "trade_execute",
            "params_digest_source": '{"ticker":"BTC","size":1.0}',
            "requested_at": datetime.now(UTC).isoformat(),
            "expires_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
        },
    )

    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-ttl")

    assert status.final_status == "EXPIRED"
    assert status.executable is False
