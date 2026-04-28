from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from colorama import Style

from .approval import derive_action_status
from .events import append_event, read_events
from .lock import read_lock, validate_lock


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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="context-os")
    sub = parser.add_subparsers(dest="cmd", required=True)
    approve = sub.add_parser("approve")
    approve.add_argument("action_hash")
    deny = sub.add_parser("deny")
    deny.add_argument("action_hash")
    deny.add_argument("--reason", required=True)
    status = sub.add_parser("status")
    status.add_argument("--watch", action="store_true")
    args = parser.parse_args(argv)
    if args.cmd == "approve":
        approve_command(repo_root=Path.cwd(), action_hash=args.action_hash, approver_meta={"actor": "human"})
        return
    if args.cmd == "deny":
        raise NotImplementedError("deny wired in task implementation")
    if args.cmd == "status":
        print(render_status(active=False, canonical_state="NO SESSIONS FOUND", projection_state=None))
        return
    sys.exit(1)
