from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .events import append_event
from .manifest import load_project_manifest
from .memory_router import build_memory_route
from .projection import mirror_approval_event
from .runtime_paths import event_log_path


def compute_action_hash(capability: str, resolved_args: dict[str, Any]) -> str:
    payload = json.dumps({"capability": capability, "args": resolved_args}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def request_critical_action(
    *,
    repo_root: Path,
    session_id: str,
    capability: str,
    resolved_args: dict[str, Any],
    ttl_seconds: int = 30,
) -> str:
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    route = build_memory_route(
        manifest=manifest,
        repo_root=repo_root,
        global_root=repo_root.parent / ".knowledge-brain",
    )
    log_path = event_log_path(repo_root)
    requested_at = datetime.now(UTC)
    action_hash = compute_action_hash(capability, resolved_args)
    event = {
        "session_id": session_id,
        "timestamp": requested_at.isoformat(),
        "event_type": "ACTION_REQUESTED",
        "action_hash": action_hash,
        "capability": capability,
        "params_digest_source": json.dumps(resolved_args, sort_keys=True),
        "requested_at": requested_at.isoformat(),
        "expires_at": (requested_at.timestamp() + ttl_seconds),
    }
    event["expires_at"] = datetime.fromtimestamp(
        float(event["expires_at"]),
        tz=UTC,
    ).isoformat()
    append_event(log_path, event)
    mirror_approval_event(event, namespace=manifest.memory_namespace, db_path=route.project_db_path)
    return action_hash


def guard_memory_write(
    *,
    session_id: str,
    action_hash: str,
    requested_namespace: str,
    allowed_namespace: str,
    global_writes_enabled: bool,
    log_path: Path,
) -> bool:
    if requested_namespace == allowed_namespace:
        return True
    if requested_namespace == "global" and not global_writes_enabled:
        append_event(
            log_path,
            {
                "session_id": session_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "event_type": "SECURITY_VIOLATION",
                "action_hash": action_hash,
                "reason": "global_memory_write_blocked",
            },
        )
        return False
    return False
