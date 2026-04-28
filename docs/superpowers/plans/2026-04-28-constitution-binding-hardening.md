# Constitution Binding Hardening (V3.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up constitution B3 binding conditions C4, C7, C8, C10, and C11 so every `BINDING/ACTIVE` event is backed by verified checks, with hard-fail on tampering and soft-fail on schema load issues.

**Architecture:** New `constitution_verifier.py` runs C11 → C4 → C8 → C7 → C10 in order, short-circuiting on hard-fail. `bind_project` calls the verifier and either raises `BindingError` (hard-fail) or merges a `binding_degraded` flag into the `SessionBindingRecord` (soft-fail). CLI surfaces hard-fail as `NOT_ACTIVE` with `exit 1`, and soft-fail as a `DEGRADED_BINDING` block in `status`.

**Tech Stack:** Python 3.11+, `hashlib` (stdlib), `re` (stdlib), `yaml` (PyYAML, already in project), `jsonschema` (already in project), `pydantic` (already in project).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `context_os_runtime/constitution_verifier.py` | **Create** | `VerificationResult` dataclass; `_check_c11`, `_check_c4`, `_check_c8`, `_check_c7`, `_check_c10` helpers; `verify_constitution` orchestrator |
| `context_os_runtime/models.py` | **Modify** | Add `verification_passed`, `verification_soft_failed`, `binding_degraded` fields to `SessionBindingRecord` |
| `context_os_runtime/binding.py` | **Modify** | Add `BindingError`; call `verify_constitution` in `bind_project`; merge result into record |
| `context_os_runtime/events.py` | **Modify** | Extend `build_binding_event` with `conditions_verified`, `failed_condition`, `soft_failed`, `detail` payload fields |
| `context_os_runtime/cli.py` | **Modify** | Catch `BindingError` in `bind_command`; add `binding_degraded` to `StatusSnapshot`; render `DEGRADED_BINDING` block |
| `context_os_runtime/doctor.py` | **Modify** | Add `_constitution_integrity_checks(repo_root)` returning five `DoctorCheck` rows (C11/C4/C8/C7/C10) |
| `tests/test_constitution_verifier.py` | **Create** | All verifier unit tests; shared `_make_valid_constitution_repo` helper |
| `tests/test_binding.py` | **Modify** | Add `_write_constitution` helper; update existing tests; add `BindingError` and `binding_degraded` tests |
| `tests/test_cli.py` | **Modify** | Add `_write_constitution` helper; update `_write_manifest`; add bind hard-fail and status DEGRADED_BINDING tests |
| `tests/test_events.py` | **Modify** | Assert new payload fields on binding event |

---

## Task 1: `VerificationResult` dataclass

**Files:**
- Create: `context_os_runtime/constitution_verifier.py`
- Create: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_constitution_verifier.py
from __future__ import annotations

from context_os_runtime.constitution_verifier import VerificationResult


def test_verification_result_shape() -> None:
    result = VerificationResult()
    assert result.passed == []
    assert result.hard_failed is None
    assert result.soft_failed == []
    assert result.detail is None
```

- [ ] **Step 2: Run test to verify it fails**

```
cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop
python -m pytest tests/test_constitution_verifier.py::test_verification_result_shape -v
```

Expected: `ModuleNotFoundError: No module named 'context_os_runtime.constitution_verifier'`

- [ ] **Step 3: Create `constitution_verifier.py` with `VerificationResult`**

```python
# context_os_runtime/constitution_verifier.py
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class VerificationResult:
    passed: list[str] = field(default_factory=list)
    hard_failed: str | None = None
    soft_failed: list[str] = field(default_factory=list)
    detail: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

```
python -m pytest tests/test_constitution_verifier.py::test_verification_result_shape -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add VerificationResult dataclass to constitution_verifier"
```

---

## Task 2: C11 check — runtime dirs writable

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_constitution_verifier.py`:

```python
from pathlib import Path

from context_os_runtime.constitution_verifier import VerificationResult, _check_c11


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
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_c11_passes_when_runtime_dir_is_writable tests/test_constitution_verifier.py::test_c11_fails_when_runtime_dir_path_is_blocked -v
```

Expected: `ImportError` for `_check_c11`

- [ ] **Step 3: Implement `_check_c11`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all 3 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add C11 runtime-dir writability check"
```

---

## Task 3: C4 check — constitution content-hash

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

The C4 hash rule: compute SHA256 of the full constitution text with the `content-hash` value replaced by an empty string. The result must equal the stored `content-hash`.

- [ ] **Step 1: Write the failing tests**

Add the shared fixture helper and two tests to `tests/test_constitution_verifier.py`:

```python
import hashlib
import json
import re

from context_os_runtime.constitution_verifier import _check_c4, _parse_b0_header

# --- shared fixture helper (used across multiple tasks) ---

_CONSTITUTION_TEMPLATE = """\
## [B0] Binding Header

\`\`\`yaml
system-id: agent-os
version: v2
canonical-path: AGENT_OS_CONSTITUTION.md
content-hash: "{content_hash}"
schema-version: "1.0.0"
contract-index-hash: "{contract_index_hash}"
clause-count: 1
blocks: [B0]
binding-mode: header-first
signature-required: false
\`\`\`
"""


def _make_valid_constitution_repo(tmp_path: Path) -> Path:
    """Create a minimal valid constitution repo for verifier tests."""
    repo = tmp_path / "repo"
    repo.mkdir()

    schemas = repo / ".agent-os" / "schemas"
    schemas.mkdir(parents=True)

    binding_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "system-id", "version", "canonical-path", "content-hash",
            "schema-version", "contract-index-hash", "clause-count",
            "blocks", "binding-mode", "signature-required",
        ],
        "properties": {
            "system-id": {"const": "agent-os"},
            "version": {"type": "string", "pattern": "^v[0-9]+$"},
            "canonical-path": {"type": "string", "minLength": 1},
            "content-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
            "schema-version": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"},
            "contract-index-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
            "clause-count": {"type": "integer", "minimum": 1},
            "blocks": {"type": "array", "minItems": 1, "items": {"type": "string", "pattern": "^B[0-9]+$"}},
            "binding-mode": {"type": "string", "enum": ["header-first"]},
            "signature-required": {"type": "boolean"},
        },
    }
    (schemas / "constitution-binding.schema.json").write_text(
        json.dumps(binding_schema, indent=2), encoding="utf-8"
    )
    (schemas / "telemetry-event.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )
    (schemas / "permission-manifest.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )

    contracts = repo / ".agent-os" / "contracts"
    contracts.mkdir(parents=True)
    index_text = json.dumps(
        {"schema_version": "1.0.0", "system_id": "agent-os", "version": "v2", "artifacts": {}},
        sort_keys=True,
    )
    contract_index_hash = hashlib.sha256(index_text.encode("utf-8")).hexdigest()
    (contracts / "index.json").write_text(index_text, encoding="utf-8")

    (repo / ".agent-os" / "runtime").mkdir(parents=True)

    placeholder = _CONSTITUTION_TEMPLATE.format(content_hash="", contract_index_hash=contract_index_hash)
    content_hash = hashlib.sha256(placeholder.encode("utf-8")).hexdigest()
    constitution_text = _CONSTITUTION_TEMPLATE.format(
        content_hash=content_hash, contract_index_hash=contract_index_hash
    )
    (repo / "AGENT_OS_CONSTITUTION.md").write_text(constitution_text, encoding="utf-8")

    return repo


# --- C4 tests ---

def test_c4_passes_with_correct_content_hash(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    path = repo / "AGENT_OS_CONSTITUTION.md"
    b0 = _parse_b0_header(path.read_text(encoding="utf-8"))

    result = _check_c4(path, b0)

    assert result.hard_failed is None
    assert "C4" in result.passed


def test_c4_fails_when_constitution_is_modified(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    path = repo / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")
    b0 = _parse_b0_header(path.read_text(encoding="utf-8"))

    result = _check_c4(path, b0)

    assert result.hard_failed == "C4"
    assert result.detail is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_c4_passes_with_correct_content_hash tests/test_constitution_verifier.py::test_c4_fails_when_constitution_is_modified -v
```

Expected: `ImportError` for `_check_c4` and `_parse_b0_header`

- [ ] **Step 3: Implement `_parse_b0_header` and `_check_c4`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
import hashlib
import json
import re

import yaml


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
```

- [ ] **Step 4: Run all verifier tests to verify they pass**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add C4 content-hash check and B0 header parser"
```

---

## Task 4: C8 check — contracts/index.json hash

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_constitution_verifier.py`:

```python
from context_os_runtime.constitution_verifier import _check_c8


def test_c8_passes_with_correct_index_hash(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    b0 = _parse_b0_header((repo / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8"))

    result = _check_c8(repo, b0)

    assert result.hard_failed is None
    assert "C8" in result.passed


def test_c8_fails_when_index_json_is_modified(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    index_path = repo / ".agent-os" / "contracts" / "index.json"
    index_path.write_text(index_path.read_text(encoding="utf-8") + " ", encoding="utf-8")
    b0 = _parse_b0_header((repo / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8"))

    result = _check_c8(repo, b0)

    assert result.hard_failed == "C8"
    assert result.detail is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_c8_passes_with_correct_index_hash tests/test_constitution_verifier.py::test_c8_fails_when_index_json_is_modified -v
```

Expected: `ImportError` for `_check_c8`

- [ ] **Step 3: Implement `_check_c8`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
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
```

- [ ] **Step 4: Run all verifier tests to verify they pass**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add C8 contract-index hash check"
```

---

## Task 5: C7 check — B0 schema validation

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_constitution_verifier.py`:

```python
from context_os_runtime.constitution_verifier import _check_c7


def test_c7_passes_with_valid_b0(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    b0 = _parse_b0_header((repo / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8"))

    result = _check_c7(repo, b0)

    assert result.hard_failed is None
    assert "C7" in result.passed


def test_c7_fails_when_b0_missing_required_field(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    b0 = _parse_b0_header((repo / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8"))
    del b0["system-id"]

    result = _check_c7(repo, b0)

    assert result.hard_failed == "C7"
    assert result.detail is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_c7_passes_with_valid_b0 tests/test_constitution_verifier.py::test_c7_fails_when_b0_missing_required_field -v
```

Expected: `ImportError` for `_check_c7`

- [ ] **Step 3: Implement `_check_c7`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
import jsonschema


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
```

- [ ] **Step 4: Run all verifier tests to verify they pass**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add C7 B0 schema validation check"
```

---

## Task 6: C10 check — schema parse (soft-fail)

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_constitution_verifier.py`:

```python
from context_os_runtime.constitution_verifier import _check_c10


def test_c10_passes_when_schemas_parse(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)

    result = _check_c10(repo)

    assert result.hard_failed is None
    assert "C10" in result.passed
    assert result.soft_failed == []


def test_c10_soft_fails_when_schema_is_malformed(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    (repo / ".agent-os" / "schemas" / "telemetry-event.schema.json").write_text(
        "{ invalid json }", encoding="utf-8"
    )

    result = _check_c10(repo)

    assert result.hard_failed is None
    assert "C10" in result.soft_failed
    assert result.detail is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_c10_passes_when_schemas_parse tests/test_constitution_verifier.py::test_c10_soft_fails_when_schema_is_malformed -v
```

Expected: `ImportError` for `_check_c10`

- [ ] **Step 3: Implement `_check_c10`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
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
```

- [ ] **Step 4: Run all verifier tests to verify they pass**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add C10 schema parse soft-fail check"
```

---

## Task 7: `verify_constitution` orchestrator — short-circuit on hard-fail

**Files:**
- Modify: `context_os_runtime/constitution_verifier.py`
- Modify: `tests/test_constitution_verifier.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_constitution_verifier.py`:

```python
from context_os_runtime.constitution_verifier import verify_constitution


def test_verify_constitution_passes_all_conditions(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)

    result = verify_constitution(repo)

    assert result.hard_failed is None
    assert set(result.passed) == {"C11", "C4", "C8", "C7", "C10"}
    assert result.soft_failed == []


def test_verify_constitution_short_circuits_on_c4_fail(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    (repo / "AGENT_OS_CONSTITUTION.md").write_text(
        (repo / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8") + "\n# tampered",
        encoding="utf-8",
    )

    result = verify_constitution(repo)

    assert result.hard_failed == "C4"
    assert "C8" not in result.passed
    assert "C7" not in result.passed
    assert "C10" not in result.passed
    assert "C10" not in result.soft_failed


def test_verify_constitution_accumulates_soft_fail(tmp_path: Path) -> None:
    repo = _make_valid_constitution_repo(tmp_path)
    (repo / ".agent-os" / "schemas" / "telemetry-event.schema.json").write_text(
        "{ bad json }", encoding="utf-8"
    )

    result = verify_constitution(repo)

    assert result.hard_failed is None
    assert "C10" in result.soft_failed
    assert {"C11", "C4", "C8", "C7"}.issubset(set(result.passed))
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_constitution_verifier.py::test_verify_constitution_passes_all_conditions tests/test_constitution_verifier.py::test_verify_constitution_short_circuits_on_c4_fail tests/test_constitution_verifier.py::test_verify_constitution_accumulates_soft_fail -v
```

Expected: `ImportError` for `verify_constitution`

- [ ] **Step 3: Implement `verify_constitution`**

Add to `context_os_runtime/constitution_verifier.py`:

```python
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
```

- [ ] **Step 4: Run all verifier tests**

```
python -m pytest tests/test_constitution_verifier.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Run full test suite to check for regressions**

```
python -m pytest --tb=short -q
```

Expected: all tests pass (verifier not yet wired into binding)

- [ ] **Step 6: Commit**

```bash
git add context_os_runtime/constitution_verifier.py tests/test_constitution_verifier.py
git commit -m "feat: add verify_constitution orchestrator with short-circuit"
```

---

## Task 8: `models.py` additions, `BindingError`, and `binding.py` integration

**Files:**
- Modify: `context_os_runtime/models.py`
- Modify: `context_os_runtime/binding.py`
- Modify: `tests/test_binding.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests in `test_binding.py`**

Add `_write_constitution` helper and two new tests to `tests/test_binding.py`:

```python
import hashlib
import json
import re
from pathlib import Path

# --- add this helper at the top of test_binding.py ---

_CONSTITUTION_TEMPLATE = """\
## [B0] Binding Header

\`\`\`yaml
system-id: agent-os
version: v2
canonical-path: AGENT_OS_CONSTITUTION.md
content-hash: "{content_hash}"
schema-version: "1.0.0"
contract-index-hash: "{contract_index_hash}"
clause-count: 1
blocks: [B0]
binding-mode: header-first
signature-required: false
\`\`\`
"""


def _write_constitution(repo_root: Path) -> None:
    schemas = repo_root / ".agent-os" / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    binding_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "system-id", "version", "canonical-path", "content-hash",
            "schema-version", "contract-index-hash", "clause-count",
            "blocks", "binding-mode", "signature-required",
        ],
        "properties": {
            "system-id": {"const": "agent-os"},
            "version": {"type": "string", "pattern": "^v[0-9]+$"},
            "canonical-path": {"type": "string", "minLength": 1},
            "content-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
            "schema-version": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"},
            "contract-index-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
            "clause-count": {"type": "integer", "minimum": 1},
            "blocks": {"type": "array", "minItems": 1, "items": {"type": "string", "pattern": "^B[0-9]+$"}},
            "binding-mode": {"type": "string", "enum": ["header-first"]},
            "signature-required": {"type": "boolean"},
        },
    }
    (schemas / "constitution-binding.schema.json").write_text(
        json.dumps(binding_schema, indent=2), encoding="utf-8"
    )
    (schemas / "telemetry-event.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )
    (schemas / "permission-manifest.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )
    contracts = repo_root / ".agent-os" / "contracts"
    contracts.mkdir(parents=True, exist_ok=True)
    index_text = json.dumps(
        {"schema_version": "1.0.0", "system_id": "agent-os", "version": "v2", "artifacts": {}},
        sort_keys=True,
    )
    contract_index_hash = hashlib.sha256(index_text.encode("utf-8")).hexdigest()
    (contracts / "index.json").write_text(index_text, encoding="utf-8")
    (repo_root / ".agent-os" / "runtime").mkdir(parents=True, exist_ok=True)
    placeholder = _CONSTITUTION_TEMPLATE.format(content_hash="", contract_index_hash=contract_index_hash)
    content_hash = hashlib.sha256(placeholder.encode("utf-8")).hexdigest()
    constitution = _CONSTITUTION_TEMPLATE.format(
        content_hash=content_hash, contract_index_hash=contract_index_hash
    )
    (repo_root / "AGENT_OS_CONSTITUTION.md").write_text(constitution, encoding="utf-8")
```

Now add the new tests:

```python
from context_os_runtime.binding import BindingError


def test_bind_project_raises_binding_error_on_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "project_id: test\ndomain_type: generic\nruntime_version: 0.1.x\n"
        "memory_namespace: test\nverification_profile: default",
        encoding="utf-8",
    )
    _write_constitution(repo_root)
    # Tamper with the constitution to trigger C4 hard-fail
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    with pytest.raises(BindingError) as exc_info:
        bind_project(repo_root)

    assert exc_info.value.condition == "C4"
    assert exc_info.value.detail is not None


def test_bind_project_sets_binding_degraded_on_c10_soft_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "project_id: test\ndomain_type: generic\nruntime_version: 0.1.x\n"
        "memory_namespace: test\nverification_profile: default",
        encoding="utf-8",
    )
    _write_constitution(repo_root)
    # Corrupt a schema to trigger C10 soft-fail
    (repo_root / ".agent-os" / "schemas" / "telemetry-event.schema.json").write_text(
        "{ bad json }", encoding="utf-8"
    )

    record = bind_project(repo_root)

    assert record.binding_degraded is True
    assert "C10" in record.verification_soft_failed
    assert record.state == "BOUND"
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_binding.py::test_bind_project_raises_binding_error_on_hard_fail tests/test_binding.py::test_bind_project_sets_binding_degraded_on_c10_soft_fail -v
```

Expected: `ImportError` for `BindingError`; `AttributeError` for `binding_degraded`

- [ ] **Step 3: Add fields to `SessionBindingRecord` in `models.py`**

In `context_os_runtime/models.py`, extend `SessionBindingRecord`:

```python
class SessionBindingRecord(BaseModel):
    session_id: str
    project_id: str
    runtime_version: str
    repo_root: str
    memory_namespace: str
    state: str
    effective_critical_actions: list[str]
    bound_at: datetime
    verification_passed: list[str] = Field(default_factory=list)
    verification_soft_failed: list[str] = Field(default_factory=list)
    binding_degraded: bool = False
```

- [ ] **Step 4: Add `BindingError` and integrate verifier into `binding.py`**

In `context_os_runtime/binding.py`, add import and `BindingError`, then update `bind_project`:

```python
from .constitution_verifier import verify_constitution


class BindingError(Exception):
    def __init__(self, condition: str, detail: str) -> None:
        super().__init__(detail)
        self.condition = condition
        self.detail = detail


def bind_project(repo_root: Path) -> SessionBindingRecord:
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    effective = resolve_effective_critical_actions(
        manifest.verification_profile,
        manifest.critical_actions,
    )
    result = verify_constitution(repo_root)
    if result.hard_failed:
        raise BindingError(result.hard_failed, result.detail or "Constitution verification failed.")
    return SessionBindingRecord(
        session_id=f"sess-{uuid4().hex[:12]}",
        project_id=manifest.project_id,
        runtime_version=resolve_runtime_version(manifest.runtime_version),
        repo_root=str(repo_root),
        memory_namespace=manifest.memory_namespace,
        state="BOUND",
        effective_critical_actions=effective,
        bound_at=datetime.now(UTC),
        verification_passed=result.passed,
        verification_soft_failed=result.soft_failed,
        binding_degraded=bool(result.soft_failed),
    )
```

- [ ] **Step 5: Run new binding tests to verify they pass**

```
python -m pytest tests/test_binding.py::test_bind_project_raises_binding_error_on_hard_fail tests/test_binding.py::test_bind_project_sets_binding_degraded_on_c10_soft_fail -v
```

Expected: both `PASSED`

- [ ] **Step 6: Fix existing `test_binding.py` tests (add constitution setup)**

The three existing tests in `test_binding.py` will now fail because `bind_project` calls `verify_constitution`, which requires the constitution tree. Add `_write_constitution(repo_root)` at the end of the manifest write block in each test:

In `test_bind_project_creates_session_binding_record`:
```python
    (repo_root / ".agent-os.yaml").write_text(...)
    _write_constitution(repo_root)  # add this line
    record = bind_project(repo_root)
```

In `test_bind_project_captures_critical_actions_and_session_id`:
```python
    (repo_root / ".agent-os.yaml").write_text(...)
    _write_constitution(repo_root)  # add this line
    record = bind_project(repo_root)
```

In `test_profile_baseline_injects_no_domain_actions`:
```python
    for profile in ("default", "sandbox", "research", "production"):
        repo_root = tmp_path / profile
        repo_root.mkdir()
        (repo_root / ".agent-os.yaml").write_text(...)
        _write_constitution(repo_root)  # add this line
        record = bind_project(repo_root)
```

- [ ] **Step 7: Fix `test_cli.py` existing bind tests (add constitution setup)**

Add the same `_CONSTITUTION_TEMPLATE` and `_write_constitution` helper to `tests/test_cli.py` (directly below the existing `_write_manifest` function), then update `_write_manifest` to call `_write_constitution` at the end:

```python
# Add _CONSTITUTION_TEMPLATE and _write_constitution (same code as in test_binding.py above)

def _write_manifest(repo_root: Path) -> None:
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join([
            "project_id: brain-playground",
            "domain_type: trading-research",
            "runtime_version: 0.1.x",
            "memory_namespace: brain-playground",
            "verification_profile: production",
            "global_memory_read: true",
            "global_memory_write: false",
            "critical_actions:",
            "  - trade_execute",
            "  - global_memory_write",
        ]),
        encoding="utf-8",
    )
    _write_constitution(repo_root)  # add this line
```

- [ ] **Step 8: Run full test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add context_os_runtime/models.py context_os_runtime/binding.py tests/test_binding.py tests/test_cli.py
git commit -m "feat: integrate constitution verifier into bind_project with BindingError and binding_degraded"
```

---

## Task 9: Extend `build_binding_event` payload

**Files:**
- Modify: `context_os_runtime/events.py`
- Modify: `tests/test_events.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_events.py`:

```python
def test_build_binding_event_includes_verification_fields() -> None:
    event = build_binding_event(
        session_id="sess-1",
        project_id="test",
        conditions_verified=["C11", "C4"],
        failed_condition="C8",
        soft_failed=[],
        detail="contract-index-hash mismatch",
    )

    assert event["payload"]["conditions_verified"] == ["C11", "C4"]
    assert event["payload"]["failed_condition"] == "C8"
    assert event["payload"]["soft_failed"] == []
    assert event["payload"]["detail"] == "contract-index-hash mismatch"


def test_build_binding_event_defaults_verification_fields() -> None:
    event = build_binding_event(session_id="sess-1", project_id="test")

    assert event["payload"]["conditions_verified"] == []
    assert event["payload"]["failed_condition"] is None
    assert event["payload"]["soft_failed"] == []
    assert event["payload"]["detail"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_events.py::test_build_binding_event_includes_verification_fields tests/test_events.py::test_build_binding_event_defaults_verification_fields -v
```

Expected: `FAILED` (KeyError on `conditions_verified`)

- [ ] **Step 3: Extend `build_binding_event` in `events.py`**

Replace the existing `build_binding_event` function:

```python
def build_binding_event(
    *,
    session_id: str,
    project_id: str,
    conditions_verified: list[str] | None = None,
    failed_condition: str | None = None,
    soft_failed: list[str] | None = None,
    detail: str | None = None,
) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="BINDING",
        payload={
            "project_id": project_id,
            "conditions_verified": conditions_verified or [],
            "failed_condition": failed_condition,
            "soft_failed": soft_failed or [],
            "detail": detail,
        },
    )
```

- [ ] **Step 4: Run all events tests**

```
python -m pytest tests/test_events.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Run full test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add context_os_runtime/events.py tests/test_events.py
git commit -m "feat: extend build_binding_event with verification payload fields"
```

---

## Task 10: CLI — `bind` exits non-zero on hard-fail

**Files:**
- Modify: `context_os_runtime/cli.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cli.py`:

```python
import pytest
from context_os_runtime.binding import BindingError


def test_bind_command_exits_nonzero_on_constitution_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    # Tamper with the constitution to trigger C4 hard-fail
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    with pytest.raises(SystemExit) as exc_info:
        bind_command(repo_root=repo_root)

    assert exc_info.value.code == 1


def test_bind_command_emits_not_active_event_on_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    with pytest.raises(SystemExit):
        bind_command(repo_root=repo_root)

    log_path = repo_root / ".agent-os" / "runtime" / "events.jsonl"
    events = read_events(log_path)
    binding_events = [e for e in events if e["event_type"] == "BINDING"]
    assert binding_events
    assert binding_events[-1]["payload"]["failed_condition"] == "C4"
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_cli.py::test_bind_command_exits_nonzero_on_constitution_hard_fail tests/test_cli.py::test_bind_command_emits_not_active_event_on_hard_fail -v
```

Expected: `FAILED` (`bind_command` does not catch `BindingError`)

- [ ] **Step 3: Update `bind_command` in `cli.py`**

Add import at the top of `cli.py` (in the `.binding` import line):

```python
from .binding import BindingError, bind_project, resolve_effective_critical_actions
```

Replace the `bind_command` function:

```python
from uuid import uuid4

def bind_command(*, repo_root: Path) -> object:
    log_path = _log_path(repo_root)
    try:
        record = bind_project(repo_root)
    except BindingError as exc:
        session_id = f"sess-{uuid4().hex[:12]}"
        append_event(
            log_path,
            build_binding_event(
                session_id=session_id,
                project_id="unknown",
                failed_condition=exc.condition,
                detail=exc.detail,
            ),
        )
        print(
            f"ERROR  Binding failed: {exc.condition} — {exc.detail}\n"
            "       Resolve the issue above before binding.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    append_event(log_path, build_binding_event(
        session_id=record.session_id,
        project_id=record.project_id,
        conditions_verified=record.verification_passed,
        soft_failed=record.verification_soft_failed,
    ))
    append_event(log_path, build_state_transition_event(session_id=record.session_id, to_state="IDLE"))
    _append_heartbeat(log_path, session_id=record.session_id, state="ACTIVE")
    write_session_snapshot(session_snapshot_path(repo_root), record)
    write_lock(
        repo_root / ".agent-os.lock",
        LockRecord(
            session_id=record.session_id,
            project_id=record.project_id,
            repo_root=str(repo_root),
            log_path=str(log_path),
        ),
    )
    return record
```

Note: the original `bind_command` called `append_event(log_path, build_binding_event(...))` unconditionally. The new version moves the event emission inside the success path and passes the verification fields.

- [ ] **Step 4: Run all CLI tests**

```
python -m pytest tests/test_cli.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 5: Run full test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add context_os_runtime/cli.py tests/test_cli.py
git commit -m "feat: bind exits non-zero and emits NOT_ACTIVE event on constitution hard-fail"
```

---

## Task 11: CLI — `status` shows `DEGRADED_BINDING` block

**Files:**
- Modify: `context_os_runtime/cli.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cli.py`:

```python
def test_status_shows_degraded_binding_when_binding_degraded(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    # Corrupt schema to trigger C10 soft-fail during bind
    (repo_root / ".agent-os" / "schemas" / "telemetry-event.schema.json").write_text(
        "{ bad json }", encoding="utf-8"
    )

    bind_command(repo_root=repo_root)
    snapshot = status_snapshot(repo_root=repo_root)
    output = render_status_view(snapshot, use_color=False)

    assert snapshot.binding_degraded is True
    assert "DEGRADED_BINDING" in output
    assert "C10" in output
```

- [ ] **Step 2: Run test to verify it fails**

```
python -m pytest tests/test_cli.py::test_status_shows_degraded_binding_when_binding_degraded -v
```

Expected: `AttributeError: 'StatusSnapshot' object has no attribute 'binding_degraded'`

- [ ] **Step 3: Add `binding_degraded` to `StatusSnapshot` and populate it in `status_snapshot`**

In `cli.py`, update the `StatusSnapshot` dataclass:

```python
@dataclass(slots=True)
class StatusSnapshot:
    mode: str
    active: bool
    repo_root: Path
    session_id: str | None
    project_id: str | None
    verification_profile: str | None
    critical_actions: list[str]
    canonical_state: str
    runtime_health_state: str
    canonical_approval_state: str | None
    projection_state: str | None
    current_action_hash: str | None
    current_capability: str | None
    effective_execution_state: str
    authority_reason: str | None
    recent_approvals: list[str]
    recent_memory: list[str]
    binding_degraded: bool = False
    binding_degraded_detail: str | None = None
```

Add a `_load_binding_degraded` helper:

```python
def _load_binding_degraded(repo_root: Path) -> tuple[bool, str | None]:
    path = session_snapshot_path(repo_root)
    if not path.exists():
        return False, None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        degraded = bool(data.get("binding_degraded", False))
        soft_failed = data.get("verification_soft_failed", [])
        detail = f"C10 schema load failed (soft-fail conditions: {', '.join(soft_failed)})" if soft_failed else None
        return degraded, detail
    except Exception:
        return False, None
```

Update both `StatusSnapshot` construction points in `status_snapshot` (the early-return branch for no sessions, and the main return) to include:

```python
        **(lambda d, det: {"binding_degraded": d, "binding_degraded_detail": det})(
            *_load_binding_degraded(repo_root)
        ),
```

Or more readably, unpack before the return:

```python
    binding_degraded, binding_degraded_detail = _load_binding_degraded(repo_root)
    return StatusSnapshot(
        ...
        binding_degraded=binding_degraded,
        binding_degraded_detail=binding_degraded_detail,
    )
```

Apply this pattern to **both** `return StatusSnapshot(...)` calls in `status_snapshot`.

Also add `import json` to the imports in `cli.py` if not already present (it is not currently imported).

- [ ] **Step 4: Update `render_status_view` to show the `DEGRADED_BINDING` block**

In `render_status_view`, after the last line before `return`, add:

```python
    if snapshot.binding_degraded:
        lines.append("")
        lines.append("DEGRADED_BINDING  C10 schema load failed — telemetry/permission schemas")
        if snapshot.binding_degraded_detail:
            lines.append(f"                  {snapshot.binding_degraded_detail}")
        lines.append("                  Run `context-os doctor` for details.")
```

- [ ] **Step 5: Run the new test and all CLI tests**

```
python -m pytest tests/test_cli.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Run full test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add context_os_runtime/cli.py tests/test_cli.py
git commit -m "feat: surface DEGRADED_BINDING in status when binding_degraded=True"
```

---

## Task 12: Doctor — constitution integrity check group

**Files:**
- Modify: `context_os_runtime/doctor.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_cli.py`:

```python
from context_os_runtime.cli import main
from context_os_runtime.doctor import run_doctor


def test_doctor_reports_constitution_integrity_checks(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)

    report = run_doctor(repo_root=repo_root)
    check_names = [c.name for c in report.checks]

    assert any("C11" in name for name in check_names)
    assert any("C4" in name for name in check_names)
    assert any("C8" in name for name in check_names)
    assert any("C7" in name for name in check_names)
    assert any("C10" in name for name in check_names)


def test_doctor_reports_constitution_c4_fail_when_tampered(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    # Tamper constitution after binding
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    report = run_doctor(repo_root=repo_root)
    c4_checks = [c for c in report.checks if "C4" in c.name]

    assert c4_checks
    assert c4_checks[0].severity == "FAIL"
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_cli.py::test_doctor_reports_constitution_integrity_checks tests/test_cli.py::test_doctor_reports_constitution_c4_fail_when_tampered -v
```

Expected: `FAILED` (no constitution checks in doctor report)

- [ ] **Step 3: Implement `_constitution_integrity_checks` in `doctor.py`**

Add import and the helper:

```python
from .constitution_verifier import verify_constitution, _check_c11, _check_c4, _check_c8, _check_c7, _check_c10, _parse_b0_header


def _constitution_integrity_checks(repo_root: Path) -> list[DoctorCheck]:
    checks: list[DoctorCheck] = []
    constitution_path = repo_root / "AGENT_OS_CONSTITUTION.md"

    # C11
    r = _check_c11(repo_root)
    checks.append(DoctorCheck(
        name="Constitution C11 — runtime dirs writable",
        severity="OK" if r.hard_failed is None else "FAIL",
        detail=r.detail or "Runtime directories are readable and writable.",
        remediation="Fix directory permissions or re-bind to recreate runtime directories." if r.hard_failed else None,
    ))
    if r.hard_failed:
        for cid in ("C4", "C8", "C7", "C10"):
            checks.append(DoctorCheck(
                name=f"Constitution {cid} — skipped",
                severity="WARN",
                detail="Skipped because C11 failed.",
            ))
        return checks

    if not constitution_path.exists():
        for cid in ("C4", "C8", "C7", "C10"):
            checks.append(DoctorCheck(
                name=f"Constitution {cid} — constitution missing",
                severity="FAIL",
                detail="AGENT_OS_CONSTITUTION.md not found.",
                remediation="Restore AGENT_OS_CONSTITUTION.md before binding.",
            ))
        return checks

    b0 = _parse_b0_header(constitution_path.read_text(encoding="utf-8"))
    if b0 is None:
        for cid in ("C4", "C8", "C7", "C10"):
            checks.append(DoctorCheck(
                name=f"Constitution {cid} — B0 parse failed",
                severity="FAIL",
                detail="Could not parse B0 header block.",
                remediation="Restore a valid AGENT_OS_CONSTITUTION.md before binding.",
            ))
        return checks

    for check_fn, cid, label in [
        (_check_c4, "C4", "content-hash"),
        (_check_c8, "C8", "contract-index-hash"),
        (_check_c7, "C7", "B0 schema validation"),
    ]:
        if cid == "C4":
            r = check_fn(constitution_path, b0)
        else:
            r = check_fn(repo_root, b0)
        checks.append(DoctorCheck(
            name=f"Constitution {cid} — {label}",
            severity="OK" if r.hard_failed is None else "FAIL",
            detail=r.detail or f"{cid} check passed.",
            remediation=f"Restore and re-bind to resolve {cid} failure." if r.hard_failed else None,
        ))

    r = _check_c10(repo_root)
    checks.append(DoctorCheck(
        name="Constitution C10 — schema parse",
        severity="WARN" if r.soft_failed else "OK",
        detail=r.detail or "Telemetry and permission schemas parse successfully.",
        remediation="Restore schema files under .agent-os/schemas/ and re-bind." if r.soft_failed else None,
    ))

    return checks
```

Update `run_doctor` to include these checks. In the `checks` list assembly in `run_doctor`, add:

```python
    checks.extend(_constitution_integrity_checks(repo_root))
```

Add this line immediately after the `checks.append(_bundle_check(repo_root))` line.

- [ ] **Step 4: Run doctor tests**

```
python -m pytest tests/test_cli.py::test_doctor_reports_constitution_integrity_checks tests/test_cli.py::test_doctor_reports_constitution_c4_fail_when_tampered -v
```

Expected: both `PASSED`

- [ ] **Step 5: Run full test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add context_os_runtime/doctor.py tests/test_cli.py
git commit -m "feat: add constitution integrity check group to doctor"
```

---

## Final verification

- [ ] **Run the complete test suite one final time**

```
python -m pytest -v
```

Expected: all tests pass, no skipped

- [ ] **Verify `bind` hard-fail UX manually**

```bash
# From the worktree root
echo "# tamper" >> AGENT_OS_CONSTITUTION.md
python -m context_os_runtime.cli bind .
echo "Exit code: $?"
# Undo
git checkout AGENT_OS_CONSTITUTION.md
```

Expected: stderr shows `ERROR  Binding failed: C4 — content-hash mismatch...`, exit code 1

- [ ] **Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: V3.0 constitution binding hardening complete"
```
