from __future__ import annotations

import json
from pathlib import Path

from .session_store import append_jsonl_event_atomic


def append_event(path: Path, payload: dict[str, object]) -> None:
    append_jsonl_event_atomic(path, payload)


def read_events(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
