from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from .events import read_events
from .manifest import load_project_manifest
from .session_store import write_json_atomic


class LockRecord(BaseModel):
    session_id: str
    project_id: str
    repo_root: str
    log_path: str


def write_lock(path: Path, record: LockRecord) -> None:
    write_json_atomic(path, record.model_dump(mode="json"))


def read_lock(path: Path) -> LockRecord:
    return LockRecord.model_validate_json(path.read_text(encoding="utf-8"))


def validate_lock(record: LockRecord, *, repo_root: Path) -> tuple[bool, str]:
    if Path(record.repo_root) != repo_root:
        return False, "repo_mismatch"
    log_path = Path(record.log_path)
    if not any(event.get("session_id") == record.session_id for event in read_events(log_path)):
        return False, "session_not_found"
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    if manifest.project_id != record.project_id:
        return False, "project_mismatch"
    return True, "ok"
