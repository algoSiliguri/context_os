from pathlib import Path

from context_os_runtime.events import (
    append_event,
    build_action_requested_event,
    build_binding_event,
    build_human_approval_event,
    build_human_denial_event,
    read_events,
)


def test_append_and_read_events(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(log_path, {"session_id": "sess-1", "event_type": "ACTION_REQUESTED"})
    append_event(log_path, {"session_id": "sess-1", "event_type": "HUMAN_APPROVAL_RECEIVED"})

    events = read_events(log_path)

    assert len(events) == 2
    assert events[0]["event_type"] == "ACTION_REQUESTED"
    assert events[1]["event_type"] == "HUMAN_APPROVAL_RECEIVED"


def test_read_events_returns_empty_for_missing_file(tmp_path: Path) -> None:
    result = read_events(tmp_path / "missing.jsonl")
    assert result == []


def test_event_builders_emit_canonical_shapes() -> None:
    binding = build_binding_event(
        session_id="sess-1",
        project_id="sample-project",
        state="BOUND",
        runtime_version="0.1.0",
    )
    requested = build_action_requested_event(
        session_id="sess-1",
        action_hash="hash-1",
        capability="deploy",
        params_digest_source="{}",
        requested_at="2026-04-28T00:00:00+00:00",
        expires_at="2026-04-28T00:01:00+00:00",
    )
    approved = build_human_approval_event(
        session_id="sess-1",
        action_hash="hash-1",
        approver_meta={"actor": "human"},
    )
    denied = build_human_denial_event(
        session_id="sess-1",
        action_hash="hash-1",
        reason="unsafe",
    )

    assert binding["event_type"] == "BINDING"
    assert binding["project_id"] == "sample-project"
    assert "timestamp" in binding

    assert requested["event_type"] == "ACTION_REQUESTED"
    assert requested["capability"] == "deploy"
    assert requested["expires_at"] == "2026-04-28T00:01:00+00:00"

    assert approved["event_type"] == "HUMAN_APPROVAL_RECEIVED"
    assert approved["approver_meta"] == {"actor": "human"}

    assert denied["event_type"] == "HUMAN_APPROVAL_DENIED"
    assert denied["reason"] == "unsafe"
