from pathlib import Path

from context_os_runtime.events import (
    append_event,
    build_binding_event,
    build_heartbeat_event,
    build_permission_denied_event,
    build_skill_load_event,
    build_skill_unload_event,
    build_state_transition_event,
    build_violation_event,
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


def test_append_event_persists_canonical_envelope(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    event = build_binding_event(session_id="sess-1", project_id="brain-playground")
    append_event(log_path, event)

    events = read_events(log_path)

    assert len(events) == 1
    assert events[0]["event_type"] == "BINDING"
    assert events[0]["session_id"] == "sess-1"
    assert events[0]["system_id"] == "agent-os"
    assert events[0]["constitution_version"] == "v2"
    assert events[0]["harness_id"] == "context-os-runtime"
    assert "event_id" in events[0]
    assert "trace_id" in events[0]
    assert "span_id" in events[0]
    assert "parent_span_id" in events[0]
    assert events[0]["payload"]["project_id"] == "brain-playground"


def test_builder_helpers_cover_visibility_and_completeness_families() -> None:
    heartbeat = build_heartbeat_event(session_id="sess-1", state="ACTIVE")
    transition = build_state_transition_event(session_id="sess-1", to_state="IDLE")
    denied = build_permission_denied_event(
        session_id="sess-1",
        action_hash="hash-1",
        reason="global_memory_write_blocked",
    )
    skill_load = build_skill_load_event(session_id="sess-1", skill_name="brain-capture")
    skill_unload = build_skill_unload_event(session_id="sess-1", skill_name="brain-capture")
    violation = build_violation_event(session_id="sess-1", reason="constitution_breach")

    assert heartbeat["event_type"] == "HEARTBEAT"
    assert heartbeat["payload"]["state"] == "ACTIVE"
    assert transition["event_type"] == "STATE_TRANSITION"
    assert transition["payload"]["to_state"] == "IDLE"
    assert denied["event_type"] == "PERMISSION_DENIED"
    assert denied["payload"]["reason"] == "global_memory_write_blocked"
    assert skill_load["event_type"] == "SKILL_LOAD"
    assert skill_load["payload"]["skill_name"] == "brain-capture"
    assert skill_unload["event_type"] == "SKILL_UNLOAD"
    assert violation["event_type"] == "VIOLATION"
