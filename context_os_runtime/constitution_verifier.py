from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class VerificationResult:
    passed: list[str] = field(default_factory=list)
    hard_failed: str | None = None
    soft_failed: list[str] = field(default_factory=list)
    detail: str | None = None
