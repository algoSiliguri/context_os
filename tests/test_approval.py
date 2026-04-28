from datetime import UTC, datetime, timedelta
from pathlib import Path

from context_os_runtime.approval import derive_action_status
from context_os_runtime.events import append_event


def test_blacklisted_hash_is_not_executable_even_if_later_approved(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    expires_at = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
    append_event(
        log_path,
        {
            "session_id": "sess-123",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "ACTION_REQUESTED",
            "action_hash": "hash-1",
            "capability": "trade_execute",
            "params_digest_source": '{"ticker":"BTC","size":1.0}',
            "requested_at": datetime.now(UTC).isoformat(),
            "expires_at": expires_at,
        },
    )
    append_event(
        log_path,
        {
            "session_id": "sess-123",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "SYSTEM_AUTO_REJECTED",
            "action_hash": "hash-1",
            "reason": "expired",
        },
    )
    append_event(
        log_path,
        {
            "session_id": "sess-123",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "HUMAN_APPROVAL_RECEIVED",
            "action_hash": "hash-1",
            "approver_meta": {"actor": "human"},
        },
    )

    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-1")

    assert status.final_status == "EXPIRED"
    assert status.blacklisted is True
    assert status.executable is False


def test_denied_hash_is_not_executable_even_if_later_approved(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    expires_at = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "ACTION_REQUESTED", "action_hash": "hash-2",
        "capability": "trade_execute", "params_digest_source": "{}",
        "requested_at": datetime.now(UTC).isoformat(), "expires_at": expires_at,
    })
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "HUMAN_APPROVAL_DENIED", "action_hash": "hash-2",
    })
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "HUMAN_APPROVAL_RECEIVED", "action_hash": "hash-2",
        "approver_meta": {"actor": "human"},
    })

    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-2")

    assert status.final_status == "DENIED"
    assert status.blacklisted is True
    assert status.executable is False


def test_pending_action_with_past_ttl_is_expired(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "ACTION_REQUESTED", "action_hash": "hash-3",
        "capability": "trade_execute", "params_digest_source": "{}",
        "requested_at": datetime.now(UTC).isoformat(),
        "expires_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    })

    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-3")

    assert status.final_status == "EXPIRED"
    assert status.executable is False


def test_approved_action_survives_past_ttl(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "ACTION_REQUESTED", "action_hash": "hash-4",
        "capability": "trade_execute", "params_digest_source": "{}",
        "requested_at": datetime.now(UTC).isoformat(),
        "expires_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    })
    append_event(log_path, {
        "session_id": "sess-123", "timestamp": datetime.now(UTC).isoformat(),
        "event_type": "HUMAN_APPROVAL_RECEIVED", "action_hash": "hash-4",
        "approver_meta": {"actor": "human"},
    })

    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-4")

    assert status.final_status == "APPROVED"
    assert status.executable is True


def test_missing_request_is_not_actionable(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"

    status = derive_action_status(log_path, session_id="sess-123", action_hash="missing-hash")

    assert status.final_status == "NOT_ACTIONABLE"
    assert status.executable is False
    assert status.blacklisted is False
