from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from colorama import Style

from .approval import derive_action_status
from .binding import bind_project
from .events import (
    append_event,
    build_binding_event,
    build_human_approval_event,
    build_human_denial_event,
    read_events,
)
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
        build_human_approval_event(
            session_id=lock.session_id,
            action_hash=action_hash,
            approver_meta=approver_meta,
        ),
    )


def deny_command(*, repo_root: Path, action_hash: str, reason: str) -> None:
    current_lock_path = repo_root / ".agent-os.lock"
    try:
        lock = read_lock(current_lock_path)
    except FileNotFoundError:
        raise RuntimeError("Cannot deny in a detached session. Please re-bind the project.")
    is_valid, _reason = validate_lock(lock, repo_root=repo_root)
    if not is_valid:
        raise RuntimeError("Cannot deny in a detached session. Please re-bind the project.")
    append_event(
        Path(lock.log_path),
        build_human_denial_event(
            session_id=lock.session_id,
            action_hash=action_hash,
            reason=reason,
        ),
    )


def render_status(*, active: bool, canonical_state: str, projection_state: str | None) -> str:
    prefix = "ACTIVE" if active else "DETACHED"
    color = Style.DIM if not active else ""
    return f"{color}{prefix} canonical={canonical_state} projection={projection_state or 'NONE'}{Style.RESET_ALL}"


def _latest_session_state(log_path: Path) -> str:
    state = "NO SESSIONS FOUND"
    for event in read_events(log_path):
        if event.get("event_type") == "BINDING":
            state = str(event.get("state", "BOUND"))
    return state


def bind_command(*, repo_root: Path) -> None:
    record = bind_project(repo_root)
    log_path = event_log_path(repo_root)
    append_event(
        log_path,
        build_binding_event(
            session_id=record.session_id,
            project_id=record.project_id,
            state=record.state,
            runtime_version=record.runtime_version,
        ),
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


def status_command(*, repo_root: Path) -> None:
    current_lock_path = lock_path(repo_root)
    current_log_path = event_log_path(repo_root)
    try:
        lock = read_lock(current_lock_path)
    except FileNotFoundError:
        if current_log_path.exists():
            print(render_status(active=False, canonical_state=_latest_session_state(current_log_path), projection_state=None))
            return
        print(render_status(active=False, canonical_state="NO SESSIONS FOUND", projection_state=None))
        return

    is_valid, _reason = validate_lock(lock, repo_root=repo_root)
    if is_valid:
        print(render_status(active=True, canonical_state=_latest_session_state(Path(lock.log_path)), projection_state=None))
        return
    if current_log_path.exists():
        print(render_status(active=False, canonical_state=_latest_session_state(current_log_path), projection_state=None))
        return
    print(render_status(active=False, canonical_state="NO SESSIONS FOUND", projection_state=None))


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
        deny_command(repo_root=Path.cwd(), action_hash=args.action_hash, reason=args.reason)
        return
    if args.cmd == "status":
        status_command(repo_root=Path.cwd())
        return
    sys.exit(1)
