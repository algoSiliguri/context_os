from pathlib import Path

from context_os_runtime.interceptor import guard_memory_write


def test_brain_playground_becomes_manifest_driven_consumer() -> None:
    repo_root = Path("/Users/koustavdas/Documents/GitHub/brain_playground")

    assert (repo_root / ".agent-os.yaml").exists()
    assert not (repo_root / "AGENT_OS_CONSTITUTION.md").exists()
    assert not (repo_root / "scripts" / "verify_agent_os_bundle.py").exists()


def test_bad_actor_global_write_is_blocked_and_logged(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    allowed_namespace = "brain-playground"

    allowed = guard_memory_write(
        session_id="sess-1",
        action_hash="hash-global",
        requested_namespace="global",
        allowed_namespace=allowed_namespace,
        global_writes_enabled=False,
        log_path=log_path,
    )

    assert allowed is False
    contents = log_path.read_text(encoding="utf-8")
    assert "PERMISSION_DENIED" in contents
    assert "SECURITY_VIOLATION" not in contents
