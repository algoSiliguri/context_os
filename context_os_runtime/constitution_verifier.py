from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class VerificationResult:
    passed: list[str] = field(default_factory=list)
    hard_failed: str | None = None
    soft_failed: list[str] = field(default_factory=list)
    detail: str | None = None


def _check_c11(repo_root: Path) -> VerificationResult:
    runtime_dir = repo_root / ".agent-os" / "runtime"
    try:
        runtime_dir.mkdir(parents=True, exist_ok=True)
        probe = runtime_dir / ".write_probe"
        probe.write_text("", encoding="utf-8")
        probe.unlink()
    except Exception as exc:
        return VerificationResult(hard_failed="C11", detail=f"Runtime directory not writable: {exc}")
    return VerificationResult(passed=["C11"])
