from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from context_os_runtime.constitution_verifier import (
    VerificationResult,
    _check_c10,
    _check_c11,
    _check_c4,
    _check_c7,
    _check_c8,
    _parse_b0_header,
    verify_constitution,
)

# ---------------------------------------------------------------------------
# Shared fixture helper
# ---------------------------------------------------------------------------

_CONSTITUTION_TEMPLATE = """\
## [B0] Binding Header

```yaml
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
```
"""

_BINDING_SCHEMA = {
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


def _make_valid_constitution_repo(tmp_path: Path) -> Path:
    """Create a minimal valid constitution repo for verifier tests."""
    repo = tmp_path / "repo"
    repo.mkdir()

    schemas = repo / ".agent-os" / "schemas"
    schemas.mkdir(parents=True)
    (schemas / "constitution-binding.schema.json").write_text(
        json.dumps(_BINDING_SCHEMA, indent=2), encoding="utf-8"
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


# ---------------------------------------------------------------------------
# Task 1: VerificationResult shape
# ---------------------------------------------------------------------------


def test_verification_result_shape() -> None:
    result = VerificationResult()
    assert result.passed == []
    assert result.hard_failed is None
    assert result.soft_failed == []
    assert result.detail is None


# ---------------------------------------------------------------------------
# Task 2: C11
# ---------------------------------------------------------------------------


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
    agent_os = repo_root / ".agent-os"
    agent_os.mkdir()
    (agent_os / "runtime").write_text("blocked", encoding="utf-8")

    result = _check_c11(repo_root)

    assert result.hard_failed == "C11"
    assert result.detail is not None


# ---------------------------------------------------------------------------
# Task 3: C4
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Task 4: C8
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Task 5: C7
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Task 6: C10
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Task 7: verify_constitution orchestrator
# ---------------------------------------------------------------------------


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
