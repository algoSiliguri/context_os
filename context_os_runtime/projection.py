from __future__ import annotations

from pathlib import Path

from knowledge_brain.approval_store import ApprovalProjection, ApprovalStore


def mirror_approval_event(event: dict[str, object], *, namespace: str, db_path: Path) -> bool:
    try:
        store = ApprovalStore(db_path)
        store.init_schema()
        final_status = {
            "ACTION_REQUESTED": "PENDING",
            "HUMAN_APPROVAL_RECEIVED": "APPROVED",
            "HUMAN_APPROVAL_DENIED": "DENIED",
            "SYSTEM_AUTO_REJECTED": "EXPIRED",
        }[str(event["event_type"])]
        store.upsert_projection(
            ApprovalProjection(
                session_id=str(event["session_id"]),
                action_hash=str(_event_value(event, "action_hash")),
                namespace=namespace,
                capability=str(_event_value(event, "capability") or ""),
                requested_at=str(_event_value(event, "requested_at") or event["timestamp"]),
                expires_at=str(_event_value(event, "expires_at") or event["timestamp"]),
                approved_at=str(event["timestamp"]) if final_status == "APPROVED" else None,
                denied_at=str(event["timestamp"]) if final_status == "DENIED" else None,
                invalidated_at=str(event["timestamp"]) if final_status == "EXPIRED" else None,
                final_status=final_status,
                reason=str(_event_value(event, "reason") or ""),
            )
        )
    except Exception:
        return True
    return True


def _event_value(event: dict[str, object], key: str) -> object | None:
    payload = event.get("payload")
    if isinstance(payload, dict) and key in payload:
        return payload[key]
    return event.get(key)
