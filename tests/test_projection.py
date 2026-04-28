from pathlib import Path

from context_os_runtime.events import build_action_requested_event
from context_os_runtime.projection import mirror_approval_event
from knowledge_brain.approval_store import ApprovalStore


def test_action_requested_is_projected_as_pending(tmp_path: Path) -> None:
    db_path = tmp_path / "knowledge.db"
    event = {
        "session_id": "sess-1",
        "action_hash": "hash-pending",
        "event_type": "ACTION_REQUESTED",
        "capability": "trade_execute",
        "requested_at": "2026-04-27T10:00:00+00:00",
        "expires_at": "2026-04-27T10:00:30+00:00",
        "timestamp": "2026-04-27T10:00:00+00:00",
    }

    ok = mirror_approval_event(
        event,
        namespace="brain-playground",
        db_path=db_path,
    )

    projection = ApprovalStore(db_path).get_projection("sess-1", "hash-pending")

    assert ok is True
    assert projection is not None
    assert projection.final_status == "PENDING"


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


def test_action_requested_is_projected_as_pending_from_payload_fields(tmp_path: Path) -> None:
    db_path = tmp_path / "knowledge.db"
    event = build_action_requested_event(
        session_id="sess-1",
        action_hash="hash-pending",
        capability="trade_execute",
        params_digest_source="{}",
        requested_at="2026-04-27T10:00:00+00:00",
        expires_at="2026-04-27T10:00:30+00:00",
        timestamp="2026-04-27T10:00:00+00:00",
    )

    ok = mirror_approval_event(
        event,
        namespace="brain-playground",
        db_path=db_path,
    )

    projection = ApprovalStore(db_path).get_projection("sess-1", "hash-pending")

    assert ok is True
    assert projection is not None
    assert projection.final_status == "PENDING"
    assert projection.capability == "trade_execute"
