from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def _base_event(
    *,
    session_id: str,
    event_type: str,
    payload: dict[str, object],
    timestamp: str | None = None,
    parent_span_id: str | None = None,
) -> dict[str, object]:
    return {
        "event_id": str(uuid4()),
        "event_type": event_type,
        "session_id": session_id,
        "trace_id": session_id,
        "span_id": str(uuid4()),
        "parent_span_id": parent_span_id,
        "system_id": "agent-os",
        "constitution_version": "v2",
        "harness_id": "context-os-runtime",
        "timestamp": timestamp or datetime.now(UTC).isoformat(),
        "payload": payload,
    }


def build_binding_event(*, session_id: str, project_id: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="BINDING",
        payload={"project_id": project_id},
    )


def build_state_transition_event(*, session_id: str, to_state: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="STATE_TRANSITION",
        payload={"to_state": to_state},
    )


def build_heartbeat_event(*, session_id: str, state: str, timestamp: str | None = None) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="HEARTBEAT",
        timestamp=timestamp,
        payload={
            "state": state,
            "queue_depth": 0,
            "loaded_skills": [],
            "hot_cache_size": 0,
            "cold_cache_size": 0,
            "last_error": None,
        },
    )


def build_permission_denied_event(*, session_id: str, action_hash: str, reason: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="PERMISSION_DENIED",
        payload={"action_hash": action_hash, "reason": reason},
    )


def build_skill_load_event(*, session_id: str, skill_name: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="SKILL_LOAD",
        payload={"skill_name": skill_name},
    )


def build_skill_unload_event(*, session_id: str, skill_name: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="SKILL_UNLOAD",
        payload={"skill_name": skill_name},
    )


def build_violation_event(*, session_id: str, reason: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="VIOLATION",
        payload={"reason": reason},
    )


def build_action_requested_event(
    *,
    session_id: str,
    action_hash: str,
    capability: str,
    params_digest_source: str,
    requested_at: str,
    expires_at: str,
    timestamp: str | None = None,
) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="ACTION_REQUESTED",
        timestamp=timestamp,
        payload={
            "action_hash": action_hash,
            "capability": capability,
            "params_digest_source": params_digest_source,
            "requested_at": requested_at,
            "expires_at": expires_at,
        },
    )


def build_human_approval_received_event(
    *,
    session_id: str,
    action_hash: str,
    approver_meta: dict[str, object],
    timestamp: str | None = None,
) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="HUMAN_APPROVAL_RECEIVED",
        timestamp=timestamp,
        payload={
            "action_hash": action_hash,
            "approver_meta": approver_meta,
        },
    )


def build_human_approval_denied_event(
    *,
    session_id: str,
    action_hash: str,
    reason: str,
    timestamp: str | None = None,
) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="HUMAN_APPROVAL_DENIED",
        timestamp=timestamp,
        payload={
            "action_hash": action_hash,
            "reason": reason,
        },
    )


def build_system_auto_rejected_event(
    *,
    session_id: str,
    action_hash: str,
    reason: str,
    timestamp: str | None = None,
) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="SYSTEM_AUTO_REJECTED",
        timestamp=timestamp,
        payload={
            "action_hash": action_hash,
            "reason": reason,
        },
    )


def append_event(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")


def read_events(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
