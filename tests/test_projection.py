from pathlib import Path

from context_os_runtime.projection import mirror_approval_event


def test_mirror_failure_does_not_raise_for_canonical_flow(tmp_path: Path) -> None:
    event = {
        "session_id": "sess-1",
        "action_hash": "hash-1",
        "event_type": "HUMAN_APPROVAL_RECEIVED",
        "capability": "trade_execute",
        "requested_at": "2026-04-27T10:00:00+00:00",
        "expires_at": "2026-04-27T10:00:30+00:00",
        "timestamp": "2026-04-27T10:00:05+00:00",
    }

    ok = mirror_approval_event(
        event,
        namespace="brain-playground",
        db_path=tmp_path / "missing" / "knowledge.db",
    )

    assert ok is True
