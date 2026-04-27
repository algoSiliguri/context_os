from pathlib import Path

from context_os_runtime.event_log import append_event


def test_append_event_writes_jsonl_record(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"

    append_event(log_path, {"event_type": "BINDING", "state": "BOUND"})

    contents = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(contents) == 1
    assert '"event_type": "BINDING"' in contents[0]
