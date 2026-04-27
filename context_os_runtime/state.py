from __future__ import annotations

from enum import StrEnum


class SessionState(StrEnum):
    BOUND = "BOUND"
    PLANNED = "PLANNED"
    EXECUTED = "EXECUTED"
    VERIFIED = "VERIFIED"
    REVIEWED = "REVIEWED"
    COMPLETE = "COMPLETE"


_ALLOWED = {
    SessionState.BOUND: {SessionState.PLANNED},
    SessionState.PLANNED: {SessionState.EXECUTED},
    SessionState.EXECUTED: {SessionState.VERIFIED},
    SessionState.VERIFIED: {SessionState.REVIEWED, SessionState.COMPLETE},
    SessionState.REVIEWED: {SessionState.COMPLETE},
    SessionState.COMPLETE: set(),
}


def transition(current: SessionState, target: SessionState) -> SessionState:
    if target not in _ALLOWED[current]:
        raise ValueError(f"invalid transition: {current} -> {target}")
    return target
