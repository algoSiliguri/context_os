from pathlib import Path

from context_os_runtime.session_store import append_jsonl_event_atomic, write_json_atomic


def test_write_json_atomic_persists_complete_document(tmp_path: Path) -> None:
    target = tmp_path / ".agent-os" / "runtime" / "session.json"

    write_json_atomic(target, {"session_id": "sess-1", "state": "BOUND"})

    assert target.exists()
    assert target.read_text(encoding="utf-8").strip().startswith("{")
    assert '"session_id": "sess-1"' in target.read_text(encoding="utf-8")


def test_append_jsonl_event_atomic_appends_without_overwriting_history(tmp_path: Path) -> None:
    target = tmp_path / ".agent-os" / "runtime" / "events.jsonl"

    append_jsonl_event_atomic(target, {"session_id": "sess-1", "event_type": "BINDING"})
    append_jsonl_event_atomic(target, {"session_id": "sess-1", "event_type": "ACTION_REQUESTED"})

    lines = target.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert '"event_type": "BINDING"' in lines[0]
    assert '"event_type": "ACTION_REQUESTED"' in lines[1]
