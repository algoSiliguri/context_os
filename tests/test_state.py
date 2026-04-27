import pytest

from context_os_runtime.state import SessionState, transition


def test_complete_requires_verified_state() -> None:
    with pytest.raises(ValueError):
        transition(SessionState.EXECUTED, SessionState.COMPLETE)
