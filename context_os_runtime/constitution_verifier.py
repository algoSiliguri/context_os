from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import jsonschema
import yaml


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


def _parse_b0_header(text: str) -> dict | None:
    match = re.search(r"```yaml\n(.*?)```", text, re.DOTALL)
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except Exception:
        return None


def _check_c4(constitution_path: Path, b0: dict) -> VerificationResult:
    expected = str(b0.get("content-hash", ""))
    if not expected:
        return VerificationResult(hard_failed="C4", detail="B0 content-hash is empty.")
    raw = constitution_path.read_text(encoding="utf-8")
    normalized = re.sub(r'(content-hash:\s*)"[^"]*"', r'\1""', raw)
    actual = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    if actual != expected:
        return VerificationResult(
            hard_failed="C4",
            detail=f"content-hash mismatch. Expected: {expected}  Got: {actual}",
        )
    return VerificationResult(passed=["C4"])


def _check_c8(repo_root: Path, b0: dict) -> VerificationResult:
    expected = str(b0.get("contract-index-hash", ""))
    if not expected:
        return VerificationResult(hard_failed="C8", detail="B0 contract-index-hash is empty.")
    index_path = repo_root / ".agent-os" / "contracts" / "index.json"
    if not index_path.exists():
        return VerificationResult(hard_failed="C8", detail=f"contracts/index.json not found at {index_path}.")
    actual = hashlib.sha256(index_path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    if actual != expected:
        return VerificationResult(
            hard_failed="C8",
            detail=f"contract-index-hash mismatch. Expected: {expected}  Got: {actual}",
        )
    return VerificationResult(passed=["C8"])


def _check_c7(repo_root: Path, b0: dict) -> VerificationResult:
    schema_path = repo_root / ".agent-os" / "schemas" / "constitution-binding.schema.json"
    if not schema_path.exists():
        return VerificationResult(hard_failed="C7", detail="constitution-binding.schema.json not found.")
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        jsonschema.validate(b0, schema)
    except jsonschema.ValidationError as exc:
        return VerificationResult(hard_failed="C7", detail=f"B0 header schema validation failed: {exc.message}")
    except Exception as exc:
        return VerificationResult(hard_failed="C7", detail=f"B0 schema error: {exc}")
    return VerificationResult(passed=["C7"])


def _check_c10(repo_root: Path) -> VerificationResult:
    schema_files = [
        repo_root / ".agent-os" / "schemas" / "telemetry-event.schema.json",
        repo_root / ".agent-os" / "schemas" / "permission-manifest.schema.json",
    ]
    errors: list[str] = []
    for schema_path in schema_files:
        if not schema_path.exists():
            errors.append(f"{schema_path.name} not found")
            continue
        try:
            json.loads(schema_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{schema_path.name}: {exc}")
    if errors:
        return VerificationResult(soft_failed=["C10"], detail="; ".join(errors))
    return VerificationResult(passed=["C10"])


def verify_constitution(repo_root: Path) -> VerificationResult:
    constitution_path = repo_root / "AGENT_OS_CONSTITUTION.md"
    passed: list[str] = []

    r = _check_c11(repo_root)
    if r.hard_failed:
        return r
    passed.extend(r.passed)

    if not constitution_path.exists():
        return VerificationResult(passed=passed, hard_failed="C4", detail="AGENT_OS_CONSTITUTION.md not found.")
    text = constitution_path.read_text(encoding="utf-8")
    b0 = _parse_b0_header(text)
    if b0 is None:
        return VerificationResult(passed=passed, hard_failed="C4", detail="Could not parse B0 header block.")

    r = _check_c4(constitution_path, b0)
    if r.hard_failed:
        r.passed = passed
        return r
    passed.extend(r.passed)

    r = _check_c8(repo_root, b0)
    if r.hard_failed:
        r.passed = passed
        return r
    passed.extend(r.passed)

    r = _check_c7(repo_root, b0)
    if r.hard_failed:
        r.passed = passed
        return r
    passed.extend(r.passed)

    r = _check_c10(repo_root)
    soft_failed = list(r.soft_failed)
    detail = r.detail
    if r.passed:
        passed.extend(r.passed)

    return VerificationResult(passed=passed, soft_failed=soft_failed, detail=detail)
