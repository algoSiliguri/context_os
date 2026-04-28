from pathlib import Path

from context_os_runtime.events import append_event, read_events


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
