from __future__ import annotations

from pathlib import Path

from knowledge_brain.approval_store import ApprovalProjection, ApprovalStore


def mirror_approval_event(event: dict[str, object], *, namespace: str, db_path: Path) -> bool:
    try:
        store = ApprovalStore(db_path)
        store.init_schema()
        final_status = {
            "HUMAN_APPROVAL_RECEIVED": "APPROVED",
            "HUMAN_APPROVAL_DENIED": "DENIED",
            "SYSTEM_AUTO_REJECTED": "EXPIRED",
        }[str(event["event_type"])]
        store.upsert_projection(
            ApprovalProjection(
                session_id=str(event["session_id"]),
                action_hash=str(event["action_hash"]),
                namespace=namespace,
                capability=str(event.get("capability", "")),
                requested_at=str(event.get("requested_at", event["timestamp"])),
                expires_at=str(event.get("expires_at", event["timestamp"])),
                approved_at=str(event["timestamp"]) if final_status == "APPROVED" else None,
                denied_at=str(event["timestamp"]) if final_status == "DENIED" else None,
                invalidated_at=str(event["timestamp"]) if final_status == "EXPIRED" else None,
                final_status=final_status,
                reason=str(event.get("reason", "")),
            )
        )
    except Exception:
        return True
    return True
