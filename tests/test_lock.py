from pathlib import Path

from context_os_runtime.events import append_event
from context_os_runtime.lock import LockRecord, validate_lock, write_lock, read_lock


def test_validate_lock_rejects_unknown_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    lock = LockRecord(
        session_id="sess-missing",
        project_id="brain-playground",
        repo_root=str(repo_root),
        log_path=str(repo_root / ".agent-os" / "events.jsonl"),
    )

    is_valid, reason = validate_lock(lock, repo_root=repo_root)

    assert is_valid is False
    assert reason == "session_not_found"


def test_write_and_read_lock(tmp_path: Path) -> None:
    lock_path = tmp_path / ".agent-os.lock"
    lock = LockRecord(
        session_id="sess-abc123def456",
        project_id="brain-playground",
        repo_root=str(tmp_path),
        log_path=str(tmp_path / ".agent-os" / "events.jsonl"),
    )

    write_lock(lock_path, lock)
    loaded = read_lock(lock_path)

    assert loaded.session_id == "sess-abc123def456"
    assert loaded.project_id == "brain-playground"
    assert loaded.repo_root == str(tmp_path)


def test_validate_lock_accepts_valid_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "project_id: brain-playground\ndomain_type: trading-research\nruntime_version: 0.1.x\nmemory_namespace: brain-playground\nverification_profile: default\n",
        encoding="utf-8",
    )
    log_path = repo_root / ".agent-os" / "events.jsonl"
    append_event(log_path, {"session_id": "sess-valid", "event_type": "ACTION_REQUESTED"})

    lock = LockRecord(
        session_id="sess-valid",
        project_id="brain-playground",
        repo_root=str(repo_root),
        log_path=str(log_path),
    )

    is_valid, reason = validate_lock(lock, repo_root=repo_root)

    assert is_valid is True
    assert reason == "ok"
