from __future__ import annotations

import argparse
import io
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from colorama import Fore, Style, init
from knowledge_brain.approval_store import ApprovalStore
from knowledge_brain.store import Store

from .approval import derive_action_status
from .binding import bind_project, resolve_effective_critical_actions
from .doctor import render_doctor_report, run_doctor
from .events import append_event, read_events
from .lock import LockRecord, read_lock, validate_lock, write_lock
from .manifest import load_project_manifest
from .memory_router import build_memory_route
from .projection import mirror_approval_event
from .runtime_paths import event_log_path, session_snapshot_path
from .session_store import write_session_snapshot


@dataclass(slots=True)
class StatusSnapshot:
    mode: str
    active: bool
    repo_root: Path
    session_id: str | None
    project_id: str | None
    verification_profile: str | None
    critical_actions: list[str]
    canonical_state: str
    projection_state: str | None
    current_action_hash: str | None
    current_capability: str | None
    effective_execution_state: str
    recent_approvals: list[str]
    recent_memory: list[str]


def _log_path(repo_root: Path) -> Path:
    return event_log_path(repo_root)


def _global_root(repo_root: Path) -> Path:
    return repo_root.parent / ".knowledge-brain"


def _route_for_repo(repo_root: Path):
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    route = build_memory_route(manifest, repo_root, _global_root(repo_root))
    return manifest, route


def _append_session_event(log_path: Path, *, session_id: str, event_type: str, **payload: object) -> dict[str, object]:
    event = {
        "session_id": session_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "event_type": event_type,
        **payload,
    }
    append_event(log_path, event)
    return event


def _load_active_lock(repo_root: Path) -> LockRecord:
    lock_path = repo_root / ".agent-os.lock"
    try:
        lock = read_lock(lock_path)
    except FileNotFoundError as exc:
        raise RuntimeError("Cannot approve in a detached session. Please re-bind the project.") from exc
    is_valid, _reason = validate_lock(lock, repo_root=repo_root)
    if not is_valid:
        raise RuntimeError("Cannot approve in a detached session. Please re-bind the project.")
    return lock


def _find_latest_session_id(log_path: Path) -> str | None:
    events = read_events(log_path)
    if not events:
        return None
    return str(events[-1].get("session_id"))


def _session_events(log_path: Path, session_id: str) -> list[dict[str, object]]:
    return [event for event in read_events(log_path) if event.get("session_id") == session_id]


def _latest_action_hash(events: list[dict[str, object]]) -> str | None:
    for event in reversed(events):
        action_hash = event.get("action_hash")
        if action_hash:
            return str(action_hash)
    return None


def _latest_capability(events: list[dict[str, object]], action_hash: str | None) -> str | None:
    if action_hash is None:
        return None
    for event in reversed(events):
        if event.get("action_hash") == action_hash and event.get("capability"):
            return str(event["capability"])
    return None


def _canonical_state(log_path: Path, session_id: str, events: list[dict[str, object]]) -> tuple[str, str | None]:
    if not events:
        return "NO SESSIONS FOUND", None
    action_hash = _latest_action_hash(events)
    if action_hash is not None:
        for event in reversed(events):
            if event.get("action_hash") != action_hash:
                continue
            if event["event_type"] == "EXECUTION_STARTED":
                return "EXECUTING", action_hash
            if event["event_type"] == "ACTION_REQUESTED":
                status = derive_action_status(log_path, session_id=session_id, action_hash=action_hash)
                if status.final_status == "PENDING":
                    return "AWAITING_APPROVAL", action_hash
                if status.final_status in {"DENIED", "EXPIRED"}:
                    return "IDLE", action_hash
                if status.final_status == "APPROVED":
                    return "AWAITING_APPROVAL", action_hash
    latest = events[-1]["event_type"]
    if latest == "SESSION_IDLE":
        return "IDLE", action_hash
    if latest == "SESSION_BOUND":
        return "BOUND", action_hash
    if latest in {"HUMAN_APPROVAL_DENIED", "SYSTEM_AUTO_REJECTED"}:
        return "IDLE", action_hash
    return str(latest), action_hash


def _load_projection_state(db_path: Path, *, session_id: str | None, action_hash: str | None) -> tuple[str | None, list[str]]:
    if not db_path.exists():
        return None, []
    store = ApprovalStore(db_path)
    projection_state: str | None = None
    if session_id is not None and action_hash is not None:
        projection = store.get_projection(session_id, action_hash)
        if projection is not None:
            projection_state = projection.final_status
    recent = []
    if projection is not None:
        recent.append(f"{projection.final_status} {projection.capability or 'unknown'} {projection.action_hash}")
    return projection_state, recent


def _load_recent_memory(db_path: Path) -> list[str]:
    if not db_path.exists():
        return []
    store = Store(db_path)
    store.init_schema()
    items, _ = store.query(limit=5)
    return [item.content for item in items]


def bind_command(*, repo_root: Path) -> object:
    record = bind_project(repo_root)
    log_path = _log_path(repo_root)
    _append_session_event(log_path, session_id=record.session_id, event_type="SESSION_BOUND", project_id=record.project_id)
    _append_session_event(log_path, session_id=record.session_id, event_type="SESSION_IDLE")
    write_session_snapshot(session_snapshot_path(repo_root), record)
    write_lock(
        repo_root / ".agent-os.lock",
        LockRecord(
            session_id=record.session_id,
            project_id=record.project_id,
            repo_root=str(repo_root),
            log_path=str(log_path),
        ),
    )
    return record


def approve_command(*, repo_root: Path, action_hash: str, approver_meta: dict[str, str]) -> None:
    lock = _load_active_lock(repo_root)
    manifest, route = _route_for_repo(repo_root)
    event = _append_session_event(
        Path(lock.log_path),
        session_id=lock.session_id,
        event_type="HUMAN_APPROVAL_RECEIVED",
        action_hash=action_hash,
        approver_meta=approver_meta,
    )
    mirror_approval_event(event, namespace=manifest.memory_namespace, db_path=route.project_db_path)


def deny_command(*, repo_root: Path, action_hash: str, reason: str) -> None:
    lock = _load_active_lock(repo_root)
    manifest, route = _route_for_repo(repo_root)
    event = _append_session_event(
        Path(lock.log_path),
        session_id=lock.session_id,
        event_type="HUMAN_APPROVAL_DENIED",
        action_hash=action_hash,
        reason=reason,
    )
    _append_session_event(Path(lock.log_path), session_id=lock.session_id, event_type="SESSION_IDLE")
    mirror_approval_event(event, namespace=manifest.memory_namespace, db_path=route.project_db_path)


def status_snapshot(*, repo_root: Path) -> StatusSnapshot:
    log_path = _log_path(repo_root)
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    route = build_memory_route(manifest, repo_root, _global_root(repo_root))
    active = False
    mode = "DETACHED"
    session_id: str | None = None
    lock_path = repo_root / ".agent-os.lock"
    if lock_path.exists():
        lock = read_lock(lock_path)
        is_valid, _reason = validate_lock(lock, repo_root=repo_root)
        if is_valid:
            active = True
            mode = "ACTIVE"
            session_id = lock.session_id
    if session_id is None:
        session_id = _find_latest_session_id(log_path)
    if session_id is None:
        return StatusSnapshot(
            mode="DETACHED",
            active=False,
            repo_root=repo_root,
            session_id=None,
            project_id=manifest.project_id,
            verification_profile=manifest.verification_profile,
            critical_actions=resolve_effective_critical_actions(
                manifest.verification_profile,
                manifest.critical_actions,
            ),
            canonical_state="NO SESSIONS FOUND",
            projection_state=None,
            current_action_hash=None,
            current_capability=None,
            effective_execution_state="NO SESSIONS FOUND",
            recent_approvals=[],
            recent_memory=_load_recent_memory(route.project_db_path),
        )
    events = _session_events(log_path, session_id)
    canonical_state, action_hash = _canonical_state(log_path, session_id, events)
    projection_state, recent_approvals = _load_projection_state(
        route.project_db_path,
        session_id=session_id,
        action_hash=action_hash,
    )
    if projection_state == "APPROVED" and canonical_state != "EXECUTING":
        effective_execution_state = "BLOCKED"
    elif canonical_state == "AWAITING_APPROVAL":
        effective_execution_state = "BLOCKED"
    else:
        effective_execution_state = canonical_state
    return StatusSnapshot(
        mode=mode,
        active=active,
        repo_root=repo_root,
        session_id=session_id,
        project_id=manifest.project_id,
        verification_profile=manifest.verification_profile,
        critical_actions=resolve_effective_critical_actions(
            manifest.verification_profile,
            manifest.critical_actions,
        ),
        canonical_state=canonical_state,
        projection_state=projection_state,
        current_action_hash=action_hash,
        current_capability=_latest_capability(events, action_hash),
        effective_execution_state=effective_execution_state,
        recent_approvals=recent_approvals,
        recent_memory=_load_recent_memory(route.project_db_path),
    )


def render_status_view(snapshot: StatusSnapshot, *, use_color: bool) -> str:
    init()
    header = "ACTIVE SESSION" if snapshot.active else "DETACHED SESSION"
    header_color = Fore.CYAN if snapshot.active else Style.DIM
    state_color = {
        "APPROVED": Fore.GREEN,
        "PENDING": Fore.YELLOW,
        "DENIED": Fore.RED,
        "EXPIRED": Fore.RED,
    }.get(snapshot.projection_state or "", "")
    lines = [
        f"{header_color}{header}{Style.RESET_ALL}" if use_color else header,
        f"repo: {snapshot.repo_root}",
        f"project: {snapshot.project_id or 'unknown'}",
        f"session: {snapshot.session_id or 'none'}",
        f"profile: {snapshot.verification_profile or 'unknown'}",
        f"critical_actions: {', '.join(snapshot.critical_actions) if snapshot.critical_actions else '(none)'}",
        f"canonical_state: {snapshot.canonical_state}",
        f"effective_execution_state: {snapshot.effective_execution_state}",
        f"current_action_hash: {snapshot.current_action_hash or 'none'}",
        f"current_capability: {snapshot.current_capability or 'none'}",
    ]
    projection_text = snapshot.projection_state or "NONE"
    if use_color and snapshot.projection_state is not None:
        projection_text = f"{state_color}{projection_text}{Style.RESET_ALL}"
    lines.append(f"projection_state: {projection_text}")
    lines.append("recent_approvals:")
    lines.extend(f"  - {item}" for item in (snapshot.recent_approvals or ["(none)"]))
    lines.append("historical_memory:")
    lines.extend(f"  - {item}" for item in (snapshot.recent_memory or ["(none)"]))
    return "\n".join(lines)


def watch_status(
    *,
    repo_root: Path,
    stream: io.TextIOBase = sys.stdout,
    interval_seconds: float = 2.0,
    iterations: int | None = None,
) -> None:
    count = 0
    try:
        while iterations is None or count < iterations:
            snapshot = status_snapshot(repo_root=repo_root)
            stream.write("\033[2J\033[H")
            stream.write(render_status_view(snapshot, use_color=stream.isatty()))
            stream.write("\n")
            stream.flush()
            count += 1
            if iterations is not None and count >= iterations:
                return
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        return


def _resolve_repo_root(raw: str | None) -> Path:
    return Path(raw).resolve() if raw is not None else Path.cwd()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="context-os")
    sub = parser.add_subparsers(dest="cmd", required=True)
    bind = sub.add_parser("bind")
    bind.add_argument("repo", nargs="?")
    approve = sub.add_parser("approve")
    approve.add_argument("action_hash")
    deny = sub.add_parser("deny")
    deny.add_argument("action_hash")
    deny.add_argument("--reason", required=True)
    doctor = sub.add_parser("doctor")
    doctor.add_argument("--repo")
    status = sub.add_parser("status")
    status.add_argument("--watch", action="store_true")
    status.add_argument("--repo")
    args = parser.parse_args(argv)
    if args.cmd == "bind":
        record = bind_command(repo_root=_resolve_repo_root(args.repo))
        print(f"BOUND {record.project_id} session={record.session_id}")
        return
    if args.cmd == "approve":
        approve_command(repo_root=Path.cwd(), action_hash=args.action_hash, approver_meta={"actor": "human"})
        return
    if args.cmd == "deny":
        deny_command(repo_root=Path.cwd(), action_hash=args.action_hash, reason=args.reason)
        return
    if args.cmd == "doctor":
        repo_root = _resolve_repo_root(args.repo)
        report = run_doctor(repo_root=repo_root)
        print(render_doctor_report(report))
        raise SystemExit(report.exit_code)
    if args.cmd == "status":
        repo_root = _resolve_repo_root(args.repo)
        if args.watch:
            watch_status(repo_root=repo_root)
        else:
            print(render_status_view(status_snapshot(repo_root=repo_root), use_color=sys.stdout.isatty()))
        return
    sys.exit(1)


if __name__ == "__main__":
    main()
