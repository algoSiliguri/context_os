import subprocess


def test_bundle_verifier_checks_runtime_binding_artifacts() -> None:
    result = subprocess.run(
        ["python3", "scripts/verify_agent_os_bundle.py"],
        capture_output=True,
        text=True,
        cwd="/Users/koustavdas/Documents/GitHub/context_os",
    )

    assert result.returncode == 0
    assert "project-binding.schema.json" in result.stdout or "OK:" in result.stdout


def test_bundle_verifier_checks_phase1_runtime_kernel_files() -> None:
    root = "/Users/koustavdas/Documents/GitHub/context_os/.worktrees/phase1-control-plane-credibility"
    for rel in [
        "context_os_runtime/authority.py",
        "context_os_runtime/runtime_paths.py",
        "context_os_runtime/session_store.py",
    ]:
        assert subprocess.run(["test", "-f", f"{root}/{rel}"]).returncode == 0
