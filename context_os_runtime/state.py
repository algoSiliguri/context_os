from __future__ import annotations

from enum import StrEnum


class SessionState(StrEnum):
    BOUND = "BOUND"
    IDLE = "IDLE"
    PLANNED = "PLANNED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    EXECUTING = "EXECUTING"
    EXECUTED = "EXECUTED"
    VERIFIED = "VERIFIED"
    REVIEWED = "REVIEWED"
    COMPLETE = "COMPLETE"


_ALLOWED = {
    SessionState.BOUND: {SessionState.IDLE},
    SessionState.IDLE: {SessionState.PLANNED},
    SessionState.PLANNED: {SessionState.AWAITING_APPROVAL, SessionState.EXECUTING},
    SessionState.AWAITING_APPROVAL: {SessionState.IDLE, SessionState.EXECUTING},
    SessionState.EXECUTING: {SessionState.EXECUTED},
    SessionState.EXECUTED: {SessionState.VERIFIED},
    SessionState.VERIFIED: {SessionState.REVIEWED, SessionState.COMPLETE},
    SessionState.REVIEWED: {SessionState.COMPLETE},
    SessionState.COMPLETE: set(),
}


def transition(current: SessionState, target: SessionState) -> SessionState:
    if target not in _ALLOWED[current]:
        raise ValueError(f"invalid transition: {current} -> {target}")
    return target
