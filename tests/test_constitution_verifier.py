from __future__ import annotations

from context_os_runtime.constitution_verifier import VerificationResult


def test_verification_result_shape() -> None:
    result = VerificationResult()
    assert result.passed == []
    assert result.hard_failed is None
    assert result.soft_failed == []
    assert result.detail is None
