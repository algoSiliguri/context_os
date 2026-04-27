from pathlib import Path

from context_os_runtime.interceptor import compute_action_hash, guard_memory_write


def test_compute_action_hash_is_deterministic() -> None:
    h1 = compute_action_hash("trade_execute", {"ticker": "BTC", "size": 1.0})
    h2 = compute_action_hash("trade_execute", {"ticker": "BTC", "size": 1.0})
    assert h1 == h2
    assert len(h1) == 16


def test_guard_memory_write_allows_matching_namespace(tmp_path: Path) -> None:
    allowed = guard_memory_write(
        session_id="sess-1",
        action_hash="hash-1",
        requested_namespace="brain-playground",
        allowed_namespace="brain-playground",
        global_writes_enabled=False,
        log_path=tmp_path / "events.jsonl",
    )
    assert allowed is True


def test_guard_memory_write_blocks_global_and_logs_violation(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    allowed = guard_memory_write(
        session_id="sess-1",
        action_hash="hash-2",
        requested_namespace="global",
        allowed_namespace="brain-playground",
        global_writes_enabled=False,
        log_path=log_path,
    )
    assert allowed is False
    contents = log_path.read_text(encoding="utf-8")
    assert "SECURITY_VIOLATION" in contents
    assert "global_memory_write_blocked" in contents
