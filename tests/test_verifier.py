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
