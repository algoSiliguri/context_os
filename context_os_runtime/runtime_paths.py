from __future__ import annotations

from pathlib import Path


def runtime_dir(repo_root: Path) -> Path:
    return repo_root / ".agent-os" / "runtime"


def event_log_path(repo_root: Path) -> Path:
    return runtime_dir(repo_root) / "events.jsonl"


def session_snapshot_path(repo_root: Path) -> Path:
    return runtime_dir(repo_root) / "session.json"
