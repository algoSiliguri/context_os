from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .approval import derive_action_status
from .events import append_event


def compute_action_hash(capability: str, resolved_args: dict[str, Any]) -> str:
    payload = json.dumps({"capability": capability, "args": resolved_args}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


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
