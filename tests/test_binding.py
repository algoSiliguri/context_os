from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

from context_os_runtime.binding import BindingError, bind_project
from context_os_runtime.models import SessionBindingRecord

# ---------------------------------------------------------------------------
# Shared constitution fixture helper
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


def _write_constitution(repo_root: Path) -> None:
    schemas = repo_root / ".agent-os" / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
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


# ---------------------------------------------------------------------------
# Existing tests (updated with _write_constitution)
# ---------------------------------------------------------------------------


def test_bind_project_creates_session_binding_record(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: default",
            ]
        ),
        encoding="utf-8",
    )
    _write_constitution(repo_root)

    record = bind_project(repo_root)

    assert isinstance(record, SessionBindingRecord)
    assert record.project_id == "brain-playground"
    assert record.runtime_version == "0.1.0"
    assert record.state == "BOUND"


def test_bind_project_captures_critical_actions_and_session_id(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: production",
                "critical_actions:",
                "  - trade_execute",
                "  - global_memory_write",
            ]
        ),
        encoding="utf-8",
    )
    _write_constitution(repo_root)

    record = bind_project(repo_root)

    assert record.project_id == "brain-playground"
    assert re.fullmatch(r"sess-[0-9a-f]{12}", record.session_id)
    assert "trade_execute" in record.effective_critical_actions
    assert "global_memory_write" in record.effective_critical_actions
    # profiles must not inject domain-specific defaults; only manifest-declared actions present
    assert "deploy" not in record.effective_critical_actions
    assert "external_api_call" not in record.effective_critical_actions
    assert record.effective_critical_actions == sorted({"global_memory_write", "trade_execute"})
    assert record.state == "BOUND"


def test_profile_baseline_injects_no_domain_actions(tmp_path: Path) -> None:
    """No verification profile should inject domain-specific critical actions."""
    for profile in ("default", "sandbox", "research", "production"):
        repo_root = tmp_path / profile
        repo_root.mkdir()
        (repo_root / ".agent-os.yaml").write_text(
            "\n".join(
                [
                    "project_id: test-project",
                    "domain_type: generic",
                    "runtime_version: 0.1.x",
                    "memory_namespace: test",
                    f"verification_profile: {profile}",
                ]
            ),
            encoding="utf-8",
        )
        _write_constitution(repo_root)

        record = bind_project(repo_root)

        assert record.effective_critical_actions == [], (
            f"profile '{profile}' injected unexpected actions: {record.effective_critical_actions}"
        )


# ---------------------------------------------------------------------------
# New tests: BindingError and binding_degraded
# ---------------------------------------------------------------------------


def test_bind_project_raises_binding_error_on_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".agent-os.yaml").write_text(
        "project_id: test\ndomain_type: generic\nruntime_version: 0.1.x\n"
        "memory_namespace: test\nverification_profile: default",
        encoding="utf-8",
    )
    _write_constitution(repo_root)
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
    (repo_root / ".agent-os" / "schemas" / "telemetry-event.schema.json").write_text(
        "{ bad json }", encoding="utf-8"
    )

    record = bind_project(repo_root)

    assert record.binding_degraded is True
    assert "C10" in record.verification_soft_failed
    assert record.state == "BOUND"
