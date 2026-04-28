import pytest

from context_os_runtime.state import SessionState, transition


def test_complete_requires_verified_state() -> None:
    with pytest.raises(ValueError):
        transition(SessionState.EXECUTED, SessionState.COMPLETE)


def test_new_state_transitions() -> None:
    assert transition(SessionState.BOUND, SessionState.IDLE) == SessionState.IDLE
    assert transition(SessionState.IDLE, SessionState.PLANNED) == SessionState.PLANNED
    assert transition(SessionState.PLANNED, SessionState.AWAITING_APPROVAL) == SessionState.AWAITING_APPROVAL
    assert transition(SessionState.AWAITING_APPROVAL, SessionState.IDLE) == SessionState.IDLE
    assert transition(SessionState.AWAITING_APPROVAL, SessionState.EXECUTING) == SessionState.EXECUTING


def test_invalid_awaiting_approval_transitions() -> None:
    with pytest.raises(ValueError):
        transition(SessionState.AWAITING_APPROVAL, SessionState.COMPLETE)
    with pytest.raises(ValueError):
        transition(SessionState.BOUND, SessionState.EXECUTING)
