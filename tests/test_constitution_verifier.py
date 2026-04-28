from __future__ import annotations

from pathlib import Path

from context_os_runtime.constitution_verifier import VerificationResult, _check_c11


def test_verification_result_shape() -> None:
    result = VerificationResult()
    assert result.passed == []
    assert result.hard_failed is None
    assert result.soft_failed == []
    assert result.detail is None


def test_c11_passes_when_runtime_dir_is_writable(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    result = _check_c11(repo_root)

    assert result.hard_failed is None
    assert "C11" in result.passed
    assert (repo_root / ".agent-os" / "runtime").is_dir()


def test_c11_fails_when_runtime_dir_path_is_blocked(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    # Place a file where the runtime dir should live — mkdir will fail
    agent_os = repo_root / ".agent-os"
    agent_os.mkdir()
    (agent_os / "runtime").write_text("blocked", encoding="utf-8")

    result = _check_c11(repo_root)

    assert result.hard_failed == "C11"
    assert result.detail is not None
