from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .session_store import append_jsonl_event_atomic


def _base_event(*, session_id: str, event_type: str) -> dict[str, object]:
    return {
        "session_id": session_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "event_type": event_type,
    }


def build_binding_event(*, session_id: str, project_id: str, state: str, runtime_version: str) -> dict[str, object]:
    event = _base_event(session_id=session_id, event_type="BINDING")
    event.update(
        {
            "project_id": project_id,
            "state": state,
            "runtime_version": runtime_version,
        }
    )
    return event


def build_action_requested_event(
    *,
    session_id: str,
    action_hash: str,
    capability: str,
    params_digest_source: str,
    requested_at: str,
    expires_at: str,
) -> dict[str, object]:
    event = _base_event(session_id=session_id, event_type="ACTION_REQUESTED")
    event.update(
        {
            "action_hash": action_hash,
            "capability": capability,
            "params_digest_source": params_digest_source,
            "requested_at": requested_at,
            "expires_at": expires_at,
        }
    )
    return event


def build_human_approval_event(
    *, session_id: str, action_hash: str, approver_meta: dict[str, str]
) -> dict[str, object]:
    event = _base_event(session_id=session_id, event_type="HUMAN_APPROVAL_RECEIVED")
    event.update(
        {
            "action_hash": action_hash,
            "approver_meta": approver_meta,
        }
    )
    return event


def build_human_denial_event(*, session_id: str, action_hash: str, reason: str) -> dict[str, object]:
    event = _base_event(session_id=session_id, event_type="HUMAN_APPROVAL_DENIED")
    event.update(
        {
            "action_hash": action_hash,
            "reason": reason,
        }
    )
    return event


def append_event(path: Path, payload: dict[str, object]) -> None:
    append_jsonl_event_atomic(path, payload)


def read_events(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
