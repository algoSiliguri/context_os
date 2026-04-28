from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from colorama import Style

from .approval import derive_action_status
from .binding import bind_project
from .events import append_event, read_events
from .lock import LockRecord, read_lock, validate_lock, write_lock
from .runtime_paths import event_log_path, lock_path, session_path
from .session_store import write_json_atomic


def approve_command(*, repo_root: Path, action_hash: str, approver_meta: dict[str, str]) -> None:
    lock_path = repo_root / ".agent-os.lock"
    try:
        lock = read_lock(lock_path)
    except FileNotFoundError:
        raise RuntimeError("Cannot approve in a detached session. Please re-bind the project.")
    is_valid, _reason = validate_lock(lock, repo_root=repo_root)
    if not is_valid:
        raise RuntimeError("Cannot approve in a detached session. Please re-bind the project.")
    append_event(
        Path(lock.log_path),
        {
            "session_id": lock.session_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "HUMAN_APPROVAL_RECEIVED",
            "action_hash": action_hash,
            "approver_meta": approver_meta,
        },
    )


def render_status(*, active: bool, canonical_state: str, projection_state: str | None) -> str:
    prefix = "ACTIVE" if active else "DETACHED"
    color = Style.DIM if not active else ""
    return f"{color}{prefix} canonical={canonical_state} projection={projection_state or 'NONE'}{Style.RESET_ALL}"


def bind_command(*, repo_root: Path) -> None:
    record = bind_project(repo_root)
    log_path = event_log_path(repo_root)
    append_event(
        log_path,
        {
            "session_id": record.session_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "BINDING",
            "project_id": record.project_id,
            "state": record.state,
            "runtime_version": record.runtime_version,
        },
    )
    write_lock(
        lock_path(repo_root),
        LockRecord(
            session_id=record.session_id,
            project_id=record.project_id,
            repo_root=str(repo_root),
            log_path=str(log_path),
        ),
    )
    write_json_atomic(session_path(repo_root), record.model_dump(mode="json"))
    print(render_status(active=True, canonical_state=record.state, projection_state=None))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="context-os")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bind")
    approve = sub.add_parser("approve")
    approve.add_argument("action_hash")
    deny = sub.add_parser("deny")
    deny.add_argument("action_hash")
    deny.add_argument("--reason", required=True)
    status = sub.add_parser("status")
    status.add_argument("--watch", action="store_true")
    args = parser.parse_args(argv)
    if args.cmd == "bind":
        bind_command(repo_root=Path.cwd())
        return
    if args.cmd == "approve":
        approve_command(repo_root=Path.cwd(), action_hash=args.action_hash, approver_meta={"actor": "human"})
        return
    if args.cmd == "deny":
        raise NotImplementedError("deny wired in task implementation")
    if args.cmd == "status":
        print(render_status(active=False, canonical_state="NO SESSIONS FOUND", projection_state=None))
        return
    sys.exit(1)
