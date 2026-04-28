# Canonical Runtime Layout Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align bind and status with the constitution’s canonical runtime artifact layout so Visibility work reads truthful disk state from `.agent-os/runtime/`.

**Architecture:** Keep the existing visibility branch shape, but route all runtime truth through one canonical runtime directory helper. `bind` will persist the lock, canonical event log, and `session.json`; `status` will read those same artifacts for active and detached views. Documentation updates will record the shipped truth and re-sequence the roadmap from the actual repo state.

**Tech Stack:** Python 3.12, `pytest`, `pydantic`, JSONL event log, local filesystem

---

### Task 1: Add failing tests for canonical runtime artifacts

**Files:**
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_bind_command_writes_canonical_runtime_artifacts(tmp_path: Path) -> None:
    ...
    assert (repo_root / ".agent-os" / "runtime" / "events.jsonl").exists()
    assert (repo_root / ".agent-os" / "runtime" / "session.json").exists()


def test_status_snapshot_reads_detached_session_from_runtime_log(tmp_path: Path) -> None:
    ...
    assert snapshot.mode == "DETACHED"
    assert snapshot.session_id == binding.session_id
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_cli.py::test_bind_command_writes_canonical_runtime_artifacts tests/test_cli.py::test_status_snapshot_reads_detached_session_from_runtime_log -q`
Expected: FAIL because bind currently writes `.agent-os/events.jsonl` and does not persist `session.json`

- [ ] **Step 3: Write minimal implementation**

```python
def runtime_dir(repo_root: Path) -> Path:
    return repo_root / ".agent-os" / "runtime"
```

```python
def session_snapshot_path(repo_root: Path) -> Path:
    return runtime_dir(repo_root) / "session.json"
```

```python
def event_log_path(repo_root: Path) -> Path:
    return runtime_dir(repo_root) / "events.jsonl"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_cli.py::test_bind_command_writes_canonical_runtime_artifacts tests/test_cli.py::test_status_snapshot_reads_detached_session_from_runtime_log -q`
Expected: PASS

### Task 2: Persist session snapshot and route lock/status through canonical paths

**Files:**
- Create: `context_os_runtime/runtime_paths.py`
- Create: `context_os_runtime/session_store.py`
- Modify: `context_os_runtime/cli.py`
- Modify: `context_os_runtime/lock.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_bind_command_persists_session_snapshot(tmp_path: Path) -> None:
    ...
    assert snapshot["session_id"] == record.session_id
    assert snapshot["state"] == "BOUND"
```

```python
def test_active_lock_points_to_canonical_runtime_log(tmp_path: Path) -> None:
    ...
    assert Path(lock.log_path) == repo_root / ".agent-os" / "runtime" / "events.jsonl"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_cli.py::test_bind_command_persists_session_snapshot tests/test_cli.py::test_active_lock_points_to_canonical_runtime_log -q`
Expected: FAIL because no session snapshot exists and the lock points at the non-canonical log path

- [ ] **Step 3: Write minimal implementation**

```python
def write_session_snapshot(path: Path, record: SessionBindingRecord) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(record.model_dump_json(indent=2), encoding="utf-8")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_cli.py::test_bind_command_persists_session_snapshot tests/test_cli.py::test_active_lock_points_to_canonical_runtime_log -q`
Expected: PASS

### Task 3: Update tracking files for the shipped slice

**Files:**
- Create: `IMPLEMENTATION_STATUS.md`
- Modify: `AGENT_OS_ROADMAP.md`

- [ ] **Step 1: Write the failing documentation test**

```python
def test_implementation_status_exists_for_session_handoff() -> None:
    status_path = Path("IMPLEMENTATION_STATUS.md")
    assert status_path.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_smoke.py::test_implementation_status_exists_for_session_handoff -q`
Expected: FAIL because the file does not exist

- [ ] **Step 3: Write the minimal documentation updates**

```markdown
# IMPLEMENTATION_STATUS
...
Current milestone: Phase 2 - Visibility
...
Next recommended slice: V2.2 doctor
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_smoke.py::test_implementation_status_exists_for_session_handoff -q`
Expected: PASS

### Task 4: Full verification for the slice

**Files:**
- Modify: `tests/test_cli.py`
- Modify: `tests/test_smoke.py`
- Modify: `context_os_runtime/cli.py`
- Create: `context_os_runtime/runtime_paths.py`
- Create: `context_os_runtime/session_store.py`
- Create: `IMPLEMENTATION_STATUS.md`
- Modify: `AGENT_OS_ROADMAP.md`

- [ ] **Step 1: Run targeted verification**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_cli.py tests/test_smoke.py -q`
Expected: PASS

- [ ] **Step 2: Run broader runtime verification**

Run: `cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && pytest tests/test_binding.py tests/test_cli.py tests/test_lock.py tests/test_projection.py tests/test_smoke.py -q`
Expected: PASS
