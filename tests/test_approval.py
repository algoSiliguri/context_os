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
