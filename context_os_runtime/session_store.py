from __future__ import annotations

from pathlib import Path

from .models import SessionBindingRecord


def write_session_snapshot(path: Path, record: SessionBindingRecord) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(record.model_dump_json(indent=2), encoding="utf-8")
