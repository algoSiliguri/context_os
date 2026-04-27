from pathlib import Path


def test_brain_playground_becomes_manifest_driven_consumer() -> None:
    repo_root = Path("/Users/koustavdas/Documents/GitHub/brain_playground")

    assert (repo_root / ".agent-os.yaml").exists()
    assert not (repo_root / "AGENT_OS_CONSTITUTION.md").exists()
    assert not (repo_root / "scripts" / "verify_agent_os_bundle.py").exists()
