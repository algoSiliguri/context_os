from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .events import read_events


@dataclass(slots=True)
class ActionStatus:
    final_status: str
    executable: bool
    blacklisted: bool


def derive_action_status(log_path: Path, *, session_id: str, action_hash: str) -> ActionStatus:
    now = datetime.now(UTC)
    requested_event: dict[str, object] | None = None
    approved = False
    final_status = "NOT_ACTIONABLE"
    for event in read_events(log_path):
        if event.get("session_id") != session_id or event.get("action_hash") != action_hash:
            continue
        if event["event_type"] == "ACTION_REQUESTED":
            requested_event = event
            final_status = "PENDING"
        elif event["event_type"] == "HUMAN_APPROVAL_DENIED":
            final_status = "DENIED"
        elif event["event_type"] == "SYSTEM_AUTO_REJECTED":
            final_status = "EXPIRED"
        elif event["event_type"] == "HUMAN_APPROVAL_RECEIVED" and final_status == "PENDING":
            approved = True
            final_status = "APPROVED"

    if requested_event is not None and final_status == "PENDING":
        expires_at = datetime.fromisoformat(str(requested_event["expires_at"]))
        if now > expires_at:
            final_status = "EXPIRED"

    blacklisted = final_status in {"DENIED", "EXPIRED"}
    executable = approved and not blacklisted
    return ActionStatus(final_status=final_status, executable=executable, blacklisted=blacklisted)
