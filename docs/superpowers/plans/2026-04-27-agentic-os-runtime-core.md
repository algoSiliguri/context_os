# Agentic OS Runtime Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runtime-core milestone for `context_os`: a machine-local runtime package that can bind a thin domain repo through a manifest, enforce deterministic state transitions with append-only event logging, route memory by namespace, and convert `brain_playground` into a pure consumer.

**Architecture:** Add a small Python runtime package inside `context_os` that owns binding, policy hydration, event logging, and namespace routing. Keep project repos declarative: they expose a manifest and optional local constitution, while the central runtime resolves version, builds a session record, and mediates memory access and verification state.

**Tech Stack:** Python 3.12, `pytest`, `pydantic`, `PyYAML`, JSON Schema, local filesystem primitives, SQLite-backed `knowledge-brain`

---

## File Map

### `context_os`

- Create: `context_os/pyproject.toml`
- Create: `context_os/context_os_runtime/__init__.py`
- Create: `context_os/context_os_runtime/cli.py`
- Create: `context_os/context_os_runtime/models.py`
- Create: `context_os/context_os_runtime/manifest.py`
- Create: `context_os/context_os_runtime/binding.py`
- Create: `context_os/context_os_runtime/state.py`
- Create: `context_os/context_os_runtime/event_log.py`
- Create: `context_os/context_os_runtime/memory_router.py`
- Create: `context_os/context_os_runtime/versioning.py`
- Create: `context_os/.agent-os/schemas/project-binding.schema.json`
- Create: `context_os/.agent-os/schemas/session-binding-record.schema.json`
- Modify: `context_os/.agent-os/contracts/index.json`
- Modify: `context_os/scripts/generate_contract_index.py`
- Modify: `context_os/scripts/verify_agent_os_bundle.py`
- Modify: `context_os/README.md`
- Test: `context_os/tests/test_manifest.py`
- Test: `context_os/tests/test_binding.py`
- Test: `context_os/tests/test_state.py`
- Test: `context_os/tests/test_event_log.py`
- Test: `context_os/tests/test_memory_router.py`
- Test: `context_os/tests/test_verifier.py`
- Test: `context_os/tests/test_playground_consumer_shape.py`

### `brain_playground`

- Create: `brain_playground/.agent-os.yaml`
- Create: `brain_playground/docs/architecture/consumer-runtime.md`
- Delete or move out of consumer: `brain_playground/AGENT_OS_CONSTITUTION.md`
- Delete or move out of consumer: `brain_playground/scripts/verify_agent_os_bundle.py`
- Delete or move out of consumer: `brain_playground/scripts/bootstrap.sh`
- Delete or move out of consumer: `brain_playground/scripts/bootstrap.ps1`
- Modify: `brain_playground/README.md`
- Modify: `brain_playground/AGENTS.md`

## Task 1: Scaffold The Central Runtime Package

**Files:**
- Create: `context_os/pyproject.toml`
- Create: `context_os/context_os_runtime/__init__.py`
- Create: `context_os/context_os_runtime/cli.py`
- Create: `context_os/tests/test_smoke.py`

- [ ] **Step 1: Write the failing smoke test**

```python
# context_os/tests/test_smoke.py
from context_os_runtime import __version__


def test_runtime_package_exposes_version() -> None:
    assert __version__ == "0.1.0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_smoke.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'context_os_runtime'`

- [ ] **Step 3: Add package metadata and minimal package**

```toml
# context_os/pyproject.toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "context-os-runtime"
version = "0.1.0"
description = "Machine-local governance runtime for Agent OS."
requires-python = ">=3.12"
dependencies = [
  "pydantic>=2.6",
  "PyYAML>=6.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
]

[project.scripts]
context-os = "context_os_runtime.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["context_os_runtime"]
```

```python
# context_os/context_os_runtime/__init__.py
__version__ = "0.1.0"
```

```python
# context_os/context_os_runtime/cli.py
from __future__ import annotations

from pathlib import Path


def main() -> None:
    print(f"context-os runtime available at {Path.cwd()}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_smoke.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add pyproject.toml context_os_runtime/__init__.py context_os_runtime/cli.py tests/test_smoke.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: scaffold context os runtime package"
```

## Task 2: Add The Project Binding Manifest Contract

**Files:**
- Create: `context_os/.agent-os/schemas/project-binding.schema.json`
- Create: `context_os/context_os_runtime/models.py`
- Create: `context_os/context_os_runtime/manifest.py`
- Test: `context_os/tests/test_manifest.py`

- [ ] **Step 1: Write the failing manifest validation test**

```python
# context_os/tests/test_manifest.py
from pathlib import Path

from context_os_runtime.manifest import load_project_manifest


def test_load_project_manifest_reads_minimum_binding_contract(tmp_path: Path) -> None:
    manifest_path = tmp_path / ".agent-os.yaml"
    manifest_path.write_text(
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

    manifest = load_project_manifest(manifest_path)

    assert manifest.project_id == "brain-playground"
    assert manifest.runtime_version == "0.1.x"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_manifest.py -v`
Expected: FAIL with `ModuleNotFoundError` or missing `load_project_manifest`

- [ ] **Step 3: Add manifest schema, model, and loader**

```json
// context_os/.agent-os/schemas/project-binding.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agent-os.local/schemas/project-binding.schema.json",
  "title": "Project Binding Manifest",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "project_id",
    "domain_type",
    "runtime_version",
    "memory_namespace",
    "verification_profile"
  ],
  "properties": {
    "project_id": { "type": "string", "minLength": 1 },
    "domain_type": { "type": "string", "minLength": 1 },
    "runtime_version": { "type": "string", "minLength": 1 },
    "memory_namespace": { "type": "string", "minLength": 1 },
    "verification_profile": { "type": "string", "minLength": 1 },
    "project_constitution": { "type": "string" },
    "global_memory_read": { "type": "boolean", "default": true },
    "global_memory_write": { "type": "boolean", "default": false }
  }
}
```

```python
# context_os/context_os_runtime/models.py
from __future__ import annotations

from pydantic import BaseModel


class ProjectManifest(BaseModel):
    project_id: str
    domain_type: str
    runtime_version: str
    memory_namespace: str
    verification_profile: str
    project_constitution: str | None = None
    global_memory_read: bool = True
    global_memory_write: bool = False
```

```python
# context_os/context_os_runtime/manifest.py
from __future__ import annotations

from pathlib import Path

import yaml

from .models import ProjectManifest


def load_project_manifest(path: Path) -> ProjectManifest:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return ProjectManifest.model_validate(data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_manifest.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add .agent-os/schemas/project-binding.schema.json context_os_runtime/models.py context_os_runtime/manifest.py tests/test_manifest.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: add project binding manifest contract"
```

## Task 3: Build The Session Binding Record

**Files:**
- Create: `context_os/.agent-os/schemas/session-binding-record.schema.json`
- Create: `context_os/context_os_runtime/versioning.py`
- Create: `context_os/context_os_runtime/binding.py`
- Test: `context_os/tests/test_binding.py`

- [ ] **Step 1: Write the failing binding test**

```python
# context_os/tests/test_binding.py
from pathlib import Path

from context_os_runtime.binding import bind_project
from context_os_runtime.models import SessionBindingRecord


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

    record = bind_project(repo_root)

    assert isinstance(record, SessionBindingRecord)
    assert record.project_id == "brain-playground"
    assert record.runtime_version == "0.1.0"
    assert record.state == "BOUND"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_binding.py -v`
Expected: FAIL because `bind_project` and `SessionBindingRecord` do not exist

- [ ] **Step 3: Add binding record schema and binder**

```json
// context_os/.agent-os/schemas/session-binding-record.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agent-os.local/schemas/session-binding-record.schema.json",
  "title": "Session Binding Record",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "project_id",
    "runtime_version",
    "repo_root",
    "memory_namespace",
    "state"
  ],
  "properties": {
    "project_id": { "type": "string" },
    "runtime_version": { "type": "string" },
    "repo_root": { "type": "string" },
    "memory_namespace": { "type": "string" },
    "state": { "const": "BOUND" }
  }
}
```

```python
# context_os/context_os_runtime/models.py
class SessionBindingRecord(BaseModel):
    project_id: str
    runtime_version: str
    repo_root: str
    memory_namespace: str
    state: str
```

```python
# context_os/context_os_runtime/versioning.py
from __future__ import annotations


def resolve_runtime_version(requested: str) -> str:
    if requested == "0.1.x":
        return "0.1.0"
    return requested
```

```python
# context_os/context_os_runtime/binding.py
from __future__ import annotations

from pathlib import Path

from .manifest import load_project_manifest
from .models import SessionBindingRecord
from .versioning import resolve_runtime_version


def bind_project(repo_root: Path) -> SessionBindingRecord:
    manifest = load_project_manifest(repo_root / ".agent-os.yaml")
    return SessionBindingRecord(
        project_id=manifest.project_id,
        runtime_version=resolve_runtime_version(manifest.runtime_version),
        repo_root=str(repo_root),
        memory_namespace=manifest.memory_namespace,
        state="BOUND",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_binding.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add .agent-os/schemas/session-binding-record.schema.json context_os_runtime/models.py context_os_runtime/versioning.py context_os_runtime/binding.py tests/test_binding.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: add session binding record"
```

## Task 4: Add Deterministic State And Append-Only Event Logging

**Files:**
- Create: `context_os/context_os_runtime/state.py`
- Create: `context_os/context_os_runtime/event_log.py`
- Test: `context_os/tests/test_state.py`
- Test: `context_os/tests/test_event_log.py`

- [ ] **Step 1: Write the failing state and event log tests**

```python
# context_os/tests/test_state.py
import pytest

from context_os_runtime.state import SessionState, transition


def test_complete_requires_verified_state() -> None:
    with pytest.raises(ValueError):
        transition(SessionState.EXECUTED, SessionState.COMPLETE)
```

```python
# context_os/tests/test_event_log.py
from pathlib import Path

from context_os_runtime.event_log import append_event


def test_append_event_writes_jsonl_record(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"

    append_event(log_path, {"event_type": "BINDING", "state": "BOUND"})

    contents = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(contents) == 1
    assert '"event_type": "BINDING"' in contents[0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_state.py tests/test_event_log.py -v`
Expected: FAIL because the runtime state and event log modules do not exist

- [ ] **Step 3: Add the state machine and append-only writer**

```python
# context_os/context_os_runtime/state.py
from __future__ import annotations

from enum import StrEnum


class SessionState(StrEnum):
    BOUND = "BOUND"
    PLANNED = "PLANNED"
    EXECUTED = "EXECUTED"
    VERIFIED = "VERIFIED"
    REVIEWED = "REVIEWED"
    COMPLETE = "COMPLETE"


_ALLOWED = {
    SessionState.BOUND: {SessionState.PLANNED},
    SessionState.PLANNED: {SessionState.EXECUTED},
    SessionState.EXECUTED: {SessionState.VERIFIED},
    SessionState.VERIFIED: {SessionState.REVIEWED, SessionState.COMPLETE},
    SessionState.REVIEWED: {SessionState.COMPLETE},
    SessionState.COMPLETE: set(),
}


def transition(current: SessionState, target: SessionState) -> SessionState:
    if target not in _ALLOWED[current]:
        raise ValueError(f"invalid transition: {current} -> {target}")
    return target
```

```python
# context_os/context_os_runtime/event_log.py
from __future__ import annotations

import json
from pathlib import Path


def append_event(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_state.py tests/test_event_log.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add context_os_runtime/state.py context_os_runtime/event_log.py tests/test_state.py tests/test_event_log.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: add deterministic state machine and event log"
```

## Task 5: Add Memory Namespace Routing

**Files:**
- Create: `context_os/context_os_runtime/memory_router.py`
- Test: `context_os/tests/test_memory_router.py`

- [ ] **Step 1: Write the failing memory routing test**

```python
# context_os/tests/test_memory_router.py
from pathlib import Path

from context_os_runtime.memory_router import MemoryRoute, build_memory_route
from context_os_runtime.models import ProjectManifest


def test_build_memory_route_prefers_project_memory_and_separates_global_root(tmp_path: Path) -> None:
    manifest = ProjectManifest(
        project_id="brain-playground",
        domain_type="trading-research",
        runtime_version="0.1.x",
        memory_namespace="brain-playground",
        verification_profile="default",
    )

    route = build_memory_route(
        manifest=manifest,
        repo_root=tmp_path / "brain_playground",
        global_root=tmp_path / ".knowledge-brain",
    )

    assert isinstance(route, MemoryRoute)
    assert route.project_db_path.name == "knowledge.db"
    assert route.project_namespace == "brain-playground"
    assert route.global_db_path.parent.name == ".knowledge-brain"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_memory_router.py -v`
Expected: FAIL because `MemoryRoute` and `build_memory_route` do not exist

- [ ] **Step 3: Add deterministic namespace routing**

```python
# context_os/context_os_runtime/memory_router.py
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from .models import ProjectManifest


class MemoryRoute(BaseModel):
    project_namespace: str
    project_db_path: Path
    global_db_path: Path
    global_memory_read: bool
    global_memory_write: bool


def build_memory_route(
    manifest: ProjectManifest,
    repo_root: Path,
    global_root: Path,
) -> MemoryRoute:
    return MemoryRoute(
        project_namespace=manifest.memory_namespace,
        project_db_path=repo_root / "data_store" / "knowledge.db",
        global_db_path=global_root / "knowledge.db",
        global_memory_read=manifest.global_memory_read,
        global_memory_write=manifest.global_memory_write,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_memory_router.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add context_os_runtime/memory_router.py tests/test_memory_router.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: add memory namespace routing"
```

## Task 6: Wire Bundle Verification And Runtime Documentation

**Files:**
- Modify: `context_os/scripts/generate_contract_index.py`
- Modify: `context_os/scripts/verify_agent_os_bundle.py`
- Modify: `context_os/.agent-os/contracts/index.json`
- Modify: `context_os/README.md`

- [ ] **Step 1: Write the failing verifier test**

```python
# context_os/tests/test_verifier.py
import subprocess


def test_bundle_verifier_checks_runtime_binding_artifacts() -> None:
    result = subprocess.run(
        ["python3", "scripts/verify_agent_os_bundle.py"],
        capture_output=True,
        text=True,
        cwd=".",
    )

    assert result.returncode == 0
    assert "project-binding.schema.json" in result.stdout or "OK:" in result.stdout
```

- [ ] **Step 2: Run test to verify current gaps**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_verifier.py -v`
Expected: FAIL because the verifier does not yet require the new binding artifacts

- [ ] **Step 3: Extend the bundle verifier and docs**

```python
# context_os/scripts/verify_agent_os_bundle.py
REQUIRED_FILES = [
    "AGENT_OS_CONSTITUTION.md",
    "CLAUDE.md",
    "AGENTS.md",
    ".github/copilot-instructions.md",
    ".agent-os/schemas/constitution-binding.schema.json",
    ".agent-os/schemas/telemetry-event.schema.json",
    ".agent-os/schemas/permission-manifest.schema.json",
    ".agent-os/schemas/project-binding.schema.json",
    ".agent-os/schemas/session-binding-record.schema.json",
    ".agent-os/contracts/index.json",
    ".agent-os/contracts/signature.json",
    "execution/SKILL_REGISTRY.md",
    "memory/MEMORY.md",
]
```

```markdown
# context_os/README.md
## Runtime Binding

Each consumer repo becomes Agent-Ready by adding a `.agent-os.yaml` manifest.
The central `context_os` runtime binds that repo, resolves a runtime version,
builds a session binding record, mounts memory namespaces, and enforces
deterministic state transitions through append-only event logging.
```

- [ ] **Step 4: Run tests and verifier**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_verifier.py -v`
Expected: PASS

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && python3 scripts/verify_agent_os_bundle.py`
Expected: PASS with `OK: Agent OS bundle verification passed`

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add scripts/verify_agent_os_bundle.py scripts/generate_contract_index.py .agent-os/contracts/index.json README.md tests/test_verifier.py
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: verify runtime binding artifacts"
```

## Task 7: Convert `brain_playground` Into A Pure Consumer

**Files:**
- Create: `brain_playground/.agent-os.yaml`
- Create: `brain_playground/docs/architecture/consumer-runtime.md`
- Modify: `brain_playground/README.md`
- Modify: `brain_playground/AGENTS.md`
- Delete: `brain_playground/AGENT_OS_CONSTITUTION.md`
- Delete: `brain_playground/scripts/bootstrap.sh`
- Delete: `brain_playground/scripts/bootstrap.ps1`
- Delete: `brain_playground/scripts/verify_agent_os_bundle.py`

- [ ] **Step 1: Write the failing consumer-shape test**

```python
# context_os/tests/test_playground_consumer_shape.py
from pathlib import Path


def test_brain_playground_becomes_manifest_driven_consumer() -> None:
    repo_root = Path("/Users/koustavdas/Documents/GitHub/brain_playground")

    assert (repo_root / ".agent-os.yaml").exists()
    assert not (repo_root / "AGENT_OS_CONSTITUTION.md").exists()
    assert not (repo_root / "scripts" / "verify_agent_os_bundle.py").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_playground_consumer_shape.py -v`
Expected: FAIL because `brain_playground` still mirrors framework files

- [ ] **Step 3: Convert the repo to a thin consumer**

```yaml
# brain_playground/.agent-os.yaml
project_id: brain-playground
domain_type: trading-research
runtime_version: 0.1.x
memory_namespace: brain-playground
verification_profile: default
project_constitution: docs/architecture/consumer-runtime.md
global_memory_read: true
global_memory_write: false
```

```markdown
# brain_playground/docs/architecture/consumer-runtime.md
# Brain Playground Consumer Runtime Notes

This repository is a thin consumer of the machine-local `context_os` runtime.
It does not vendor framework governance files.

Local constraints:

- use the central runtime for binding and verification
- treat `data_store/knowledge.db` as project-local memory
- allow reads from global memory, but keep project writes local by default
```

```markdown
# brain_playground/AGENTS.md
[A1] Consumer Declaration
This repository is a consumer of a centrally installed Agent OS runtime.

[A2] Binding Instruction
Before execution, locate `.agent-os.yaml` and bind through the machine-local runtime.

[A3] Failure Instruction
If the runtime cannot bind successfully, do not proceed as active.

[A4] Deference
The central runtime constitution and policies govern execution.
```

- [ ] **Step 4: Run consumer-shape verification**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_playground_consumer_shape.py -v`
Expected: PASS

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && python3 -c "from context_os_runtime.binding import bind_project; from pathlib import Path; print(bind_project(Path('/Users/koustavdas/Documents/GitHub/brain_playground')).state)"`
Expected: prints `BOUND`

- [ ] **Step 5: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/brain_playground add .agent-os.yaml docs/architecture/consumer-runtime.md README.md AGENTS.md
git -C /Users/koustavdas/Documents/GitHub/brain_playground rm AGENT_OS_CONSTITUTION.md scripts/bootstrap.sh scripts/bootstrap.ps1 scripts/verify_agent_os_bundle.py
git -C /Users/koustavdas/Documents/GitHub/brain_playground commit -m "refactor: convert playground to pure runtime consumer"
```

## Task 8: Run The First Milestone Verification Sweep

**Files:**
- Modify: `context_os/docs/superpowers/plans/2026-04-27-agentic-os-runtime-core.md`

- [ ] **Step 1: Run focused unit tests**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && pytest tests/test_smoke.py tests/test_manifest.py tests/test_binding.py tests/test_state.py tests/test_event_log.py tests/test_memory_router.py tests/test_verifier.py tests/test_playground_consumer_shape.py -v`
Expected: PASS for all tests

- [ ] **Step 2: Run the bundle verifier**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && python3 scripts/verify_agent_os_bundle.py`
Expected: PASS with `OK: Agent OS bundle verification passed`

- [ ] **Step 3: Run the binder against the real consumer**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os && python3 -c "from context_os_runtime.binding import bind_project; from pathlib import Path; record = bind_project(Path('/Users/koustavdas/Documents/GitHub/brain_playground')); print(record.model_dump_json())"`
Expected: JSON output including `"project_id":"brain-playground"` and `"state":"BOUND"`

- [ ] **Step 4: Commit the verified milestone**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os add .
git -C /Users/koustavdas/Documents/GitHub/context_os commit -m "feat: deliver agentic os runtime core milestone"
```

## Self-Review

### Spec Coverage

- Binding contract: covered by Tasks 2 and 3
- Runtime version resolution: covered by Task 3
- Deterministic shell state model: covered by Task 4
- Append-only event log: covered by Task 4
- Memory namespace routing: covered by Task 5
- Bundle verification and docs: covered by Task 6
- `brain_playground` conversion into a pure consumer: covered by Task 7
- First milestone verification sweep: covered by Task 8

### Placeholder Scan

- No `TBD`, `TODO`, or deferred implementation markers remain
- Every task contains exact file paths
- Every execution step includes concrete commands

### Type Consistency

- `ProjectManifest` is defined before routing and binding use it
- `SessionBindingRecord` is introduced before tests rely on it
- `SessionState` names match the approved spec
