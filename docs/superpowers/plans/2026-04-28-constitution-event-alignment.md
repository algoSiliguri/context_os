# Constitution Event Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the shipped Phase 2 visibility runtime with `AGENT_OS_CONSTITUTION.md` by emitting one canonical event envelope and migrating runtime readers and writers off ad hoc event names.

**Architecture:** Centralize event construction in `context_os_runtime/events.py` so CLI, approval, interceptor, and projection flows all persist the same envelope shape. Keep this slice writer-first and branch-local: update the active runtime readers to consume the canonical envelope and payload structure, but do not introduce orchestration, daemons, or historical log migration.

**Tech Stack:** Python 3.12, `pytest`, JSONL event log, local filesystem, `knowledge_brain` approval projection

---

## File Map

- `context_os_runtime/events.py`
  Responsibility: canonical event envelope defaults, event builders, append/read helpers.
- `context_os_runtime/cli.py`
  Responsibility: bind/approve/deny/status/watch runtime event emission and canonical status reconstruction.
- `context_os_runtime/interceptor.py`
  Responsibility: critical action request events and permission-denied telemetry.
- `context_os_runtime/approval.py`
  Responsibility: derive approval state from normalized canonical event history.
- `context_os_runtime/projection.py`
  Responsibility: mirror canonical approval lifecycle events into the approval projection store.
- `tests/test_events.py`
  Responsibility: event envelope, payload normalization, and completeness-builder coverage.
- `tests/test_cli.py`
  Responsibility: bind/status/watch event contract and canonical state reconstruction.
- `tests/test_interceptor.py`
  Responsibility: request and denied-write event emission semantics.
- `tests/test_approval.py`
  Responsibility: approval derivation from normalized payload-bearing events.
- `tests/test_projection.py`
  Responsibility: projection mirroring from canonical approval lifecycle events.
- `tests/test_playground_consumer_shape.py`
  Responsibility: guard against leaking old denial event names into consumer expectations.
- `IMPLEMENTATION_STATUS.md`
  Responsibility: shipped truth for the completed slice and next recommended slice.
- `AGENT_OS_ROADMAP.md`
  Responsibility: backlog sequencing after this slice lands.

### Task 1: Add failing tests for the canonical event envelope and builders

**Files:**
- Modify: `tests/test_events.py`

- [ ] **Step 1: Write the failing tests**

```python
from context_os_runtime.events import (
    append_event,
    build_binding_event,
    build_heartbeat_event,
    build_permission_denied_event,
    build_skill_load_event,
    build_skill_unload_event,
    build_state_transition_event,
    build_violation_event,
    read_events,
)


def test_append_event_persists_canonical_envelope(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    event = build_binding_event(session_id="sess-1", project_id="brain-playground")
    append_event(log_path, event)

    events = read_events(log_path)

    assert len(events) == 1
    assert events[0]["event_type"] == "BINDING"
    assert events[0]["session_id"] == "sess-1"
    assert events[0]["system_id"] == "agent-os"
    assert events[0]["constitution_version"] == "v2"
    assert events[0]["harness_id"] == "context-os-runtime"
    assert "event_id" in events[0]
    assert "trace_id" in events[0]
    assert "span_id" in events[0]
    assert "parent_span_id" in events[0]
    assert events[0]["payload"]["project_id"] == "brain-playground"


def test_builder_helpers_cover_visibility_and_completeness_families() -> None:
    heartbeat = build_heartbeat_event(session_id="sess-1", state="ACTIVE")
    transition = build_state_transition_event(session_id="sess-1", to_state="IDLE")
    denied = build_permission_denied_event(
        session_id="sess-1",
        action_hash="hash-1",
        reason="global_memory_write_blocked",
    )
    skill_load = build_skill_load_event(session_id="sess-1", skill_name="brain-capture")
    skill_unload = build_skill_unload_event(session_id="sess-1", skill_name="brain-capture")
    violation = build_violation_event(session_id="sess-1", reason="constitution_breach")

    assert heartbeat["event_type"] == "HEARTBEAT"
    assert heartbeat["payload"]["state"] == "ACTIVE"
    assert transition["event_type"] == "STATE_TRANSITION"
    assert transition["payload"]["to_state"] == "IDLE"
    assert denied["event_type"] == "PERMISSION_DENIED"
    assert denied["payload"]["reason"] == "global_memory_write_blocked"
    assert skill_load["event_type"] == "SKILL_LOAD"
    assert skill_load["payload"]["skill_name"] == "brain-capture"
    assert skill_unload["event_type"] == "SKILL_UNLOAD"
    assert violation["event_type"] == "VIOLATION"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_events.py`
Expected: FAIL because `events.py` only appends arbitrary dictionaries and does not expose canonical builders or envelope defaults.

- [ ] **Step 3: Write minimal implementation**

```python
def _base_event(*, session_id: str, event_type: str, payload: dict[str, object]) -> dict[str, object]:
    return {
        "event_id": str(uuid4()),
        "event_type": event_type,
        "session_id": session_id,
        "trace_id": session_id,
        "span_id": str(uuid4()),
        "parent_span_id": None,
        "system_id": "agent-os",
        "constitution_version": "v2",
        "harness_id": "context-os-runtime",
        "timestamp": datetime.now(UTC).isoformat(),
        "payload": payload,
    }
```

```python
def build_binding_event(*, session_id: str, project_id: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="BINDING",
        payload={"project_id": project_id},
    )
```

```python
def build_state_transition_event(*, session_id: str, to_state: str) -> dict[str, object]:
    return _base_event(
        session_id=session_id,
        event_type="STATE_TRANSITION",
        payload={"to_state": to_state},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_events.py`
Expected: PASS

### Task 2: Migrate runtime writers to canonical event helpers

**Files:**
- Modify: `context_os_runtime/events.py`
- Modify: `context_os_runtime/cli.py`
- Modify: `context_os_runtime/interceptor.py`
- Modify: `tests/test_cli.py`
- Modify: `tests/test_interceptor.py`
- Modify: `tests/test_playground_consumer_shape.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_bind_command_writes_canonical_binding_and_idle_transition(tmp_path: Path) -> None:
    ...
    events = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")
    assert [event["event_type"] for event in events[:2]] == ["BINDING", "STATE_TRANSITION"]
    assert events[0]["payload"]["project_id"] == "brain-playground"
    assert events[1]["payload"]["to_state"] == "IDLE"


def test_status_snapshot_reconstructs_idle_from_state_transition(tmp_path: Path) -> None:
    ...
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        build_state_transition_event(session_id=binding.session_id, to_state="IDLE"),
    )
    snapshot = status_snapshot(repo_root=repo_root)
    assert snapshot.canonical_state == "IDLE"


def test_guard_memory_write_blocks_global_and_logs_permission_denied(tmp_path: Path) -> None:
    ...
    contents = log_path.read_text(encoding="utf-8")
    assert "PERMISSION_DENIED" in contents
    assert "SECURITY_VIOLATION" not in contents
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_cli.py -k 'binding_and_idle_transition or reconstructs_idle_from_state_transition' tests/test_interceptor.py::test_guard_memory_write_blocks_global_and_logs_permission_denied tests/test_playground_consumer_shape.py::test_bad_actor_global_write_is_blocked_and_logged`
Expected: FAIL because bind still emits `SESSION_BOUND` and `SESSION_IDLE`, and the interceptor still emits `SECURITY_VIOLATION`.

- [ ] **Step 3: Write minimal implementation**

```python
def bind_command(*, repo_root: Path) -> object:
    record = bind_project(repo_root)
    log_path = _log_path(repo_root)
    append_event(log_path, build_binding_event(session_id=record.session_id, project_id=record.project_id))
    append_event(log_path, build_state_transition_event(session_id=record.session_id, to_state="IDLE"))
    append_event(log_path, build_heartbeat_event(session_id=record.session_id, state="ACTIVE"))
    ...
```

```python
event = build_permission_denied_event(
    session_id=session_id,
    action_hash=action_hash,
    reason="global_memory_write_blocked",
)
append_event(log_path, event)
```

```python
if latest == "STATE_TRANSITION" and event.get("payload", {}).get("to_state") == "IDLE":
    return "IDLE", action_hash
if latest == "BINDING":
    return "BOUND", action_hash
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_cli.py -k 'binding_and_idle_transition or reconstructs_idle_from_state_transition' tests/test_interceptor.py::test_guard_memory_write_blocks_global_and_logs_permission_denied tests/test_playground_consumer_shape.py::test_bad_actor_global_write_is_blocked_and_logged`
Expected: PASS

### Task 3: Normalize approval and projection reads around payload-bearing canonical events

**Files:**
- Modify: `context_os_runtime/interceptor.py`
- Modify: `context_os_runtime/approval.py`
- Modify: `context_os_runtime/projection.py`
- Modify: `tests/test_approval.py`
- Modify: `tests/test_projection.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_request_critical_action_emits_canonical_payload_fields(tmp_path: Path) -> None:
    ...
    event = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")[-1]
    assert event["event_type"] == "ACTION_REQUESTED"
    assert event["payload"]["action_hash"] == action_hash
    assert event["payload"]["capability"] == "trade_execute"
    assert "requested_at" in event["payload"]
    assert "expires_at" in event["payload"]


def test_approved_action_survives_past_ttl_from_payload_fields(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(
        log_path,
        build_action_requested_event(
            session_id="sess-123",
            action_hash="hash-4",
            capability="trade_execute",
            params_digest_source="{}",
            requested_at=datetime.now(UTC).isoformat(),
            expires_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
        ),
    )
    append_event(
        log_path,
        build_human_approval_received_event(
            session_id="sess-123",
            action_hash="hash-4",
            approver_meta={"actor": "human"},
        ),
    )
    status = derive_action_status(log_path, session_id="sess-123", action_hash="hash-4")
    assert status.final_status == "APPROVED"
    assert status.executable is True


def test_action_requested_is_projected_as_pending_from_payload_fields(tmp_path: Path) -> None:
    ...
    assert projection.final_status == "PENDING"
    assert projection.capability == "trade_execute"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_approval.py tests/test_projection.py tests/test_cli.py -k 'payload_fields or request_critical_action_emits_canonical_payload_fields'`
Expected: FAIL because approval and projection logic still expects business fields like `action_hash`, `expires_at`, and `capability` at the top level.

- [ ] **Step 3: Write minimal implementation**

```python
def _event_value(event: dict[str, object], key: str) -> object | None:
    payload = event.get("payload")
    if isinstance(payload, dict) and key in payload:
        return payload[key]
    return event.get(key)
```

```python
event = build_action_requested_event(
    session_id=session_id,
    action_hash=action_hash,
    capability=capability,
    params_digest_source=json.dumps(resolved_args, sort_keys=True),
    requested_at=requested_at.isoformat(),
    expires_at=expires_at.isoformat(),
)
append_event(log_path, event)
mirror_approval_event(event, namespace=manifest.memory_namespace, db_path=route.project_db_path)
```

```python
if event["event_type"] == "ACTION_REQUESTED":
    requested_event = event
elif event["event_type"] == "HUMAN_APPROVAL_RECEIVED" and final_status == "PENDING":
    approved = True
    final_status = "APPROVED"
...
expires_at = datetime.fromisoformat(str(_event_value(requested_event, "expires_at")))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_approval.py tests/test_projection.py tests/test_cli.py -k 'payload_fields or request_critical_action_emits_canonical_payload_fields'`
Expected: PASS

### Task 4: Finish canonical status reconstruction and heartbeat compatibility on the active branch

**Files:**
- Modify: `context_os_runtime/cli.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_bind_command_emits_canonical_heartbeat_envelope(tmp_path: Path) -> None:
    ...
    heartbeat_events = [event for event in events if event["event_type"] == "HEARTBEAT"]
    assert heartbeat_events[-1]["system_id"] == "agent-os"
    assert heartbeat_events[-1]["payload"]["state"] == "ACTIVE"


def test_status_snapshot_reports_suspect_when_canonical_heartbeat_is_stale(tmp_path: Path) -> None:
    ...
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        build_heartbeat_event(
            session_id=binding.session_id,
            state="ACTIVE",
            timestamp=(datetime.now(UTC) - timedelta(seconds=31)).isoformat(),
        ),
    )
    snapshot = status_snapshot(repo_root=repo_root)
    assert snapshot.runtime_health_state == "SUSPECT"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_cli.py -k 'canonical_heartbeat_envelope or canonical_heartbeat_is_stale'`
Expected: FAIL because the heartbeat tests still rely on ad hoc event construction rather than canonical heartbeat builders.

- [ ] **Step 3: Write minimal implementation**

```python
def build_heartbeat_event(
    *,
    session_id: str,
    state: str,
    timestamp: str | None = None,
) -> dict[str, object]:
    event = _base_event(
        session_id=session_id,
        event_type="HEARTBEAT",
        payload={
            "state": state,
            "queue_depth": 0,
            "loaded_skills": [],
            "hot_cache_size": 0,
            "cold_cache_size": 0,
            "last_error": None,
        },
    )
    if timestamp is not None:
        event["timestamp"] = timestamp
    return event
```

```python
def _append_heartbeat(log_path: Path, *, session_id: str, state: str) -> dict[str, object]:
    event = build_heartbeat_event(session_id=session_id, state=state)
    append_event(log_path, event)
    return event
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_cli.py -k 'canonical_heartbeat_envelope or canonical_heartbeat_is_stale'`
Expected: PASS

### Task 5: Update tracking files and run slice verification

**Files:**
- Modify: `IMPLEMENTATION_STATUS.md`
- Modify: `AGENT_OS_ROADMAP.md`
- Modify: `tests/test_smoke.py`

- [ ] **Step 1: Write the failing documentation test**

```python
def test_tracking_files_point_to_post_event_alignment_slice() -> None:
    roadmap = Path("AGENT_OS_ROADMAP.md").read_text(encoding="utf-8")
    status = Path("IMPLEMENTATION_STATUS.md").read_text(encoding="utf-8")
    assert "constitution event alignment" in status.lower()
    assert "project-agnostic critical-action baseline cleanup" in roadmap.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_smoke.py::test_tracking_files_point_to_post_event_alignment_slice`
Expected: FAIL because the tracking files still describe the pre-alignment next slice.

- [ ] **Step 3: Write the minimal documentation updates**

```markdown
# IMPLEMENTATION_STATUS
...
- Completed: constitution-aligned canonical event envelope for Phase 2 visibility runtime
- Canonical runtime now emits `BINDING`, `STATE_TRANSITION`, `HEARTBEAT`, and `PERMISSION_DENIED`
- Added completeness builders for `SKILL_LOAD`, `SKILL_UNLOAD`, and `VIOLATION`
...
Next recommended slice: project-agnostic critical-action baseline cleanup
```

```markdown
# AGENT_OS_ROADMAP
...
- [x] V2.5 constitution event alignment
- [ ] V2.6 project-agnostic critical-action baseline cleanup
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_smoke.py::test_tracking_files_point_to_post_event_alignment_slice`
Expected: PASS

- [ ] **Step 5: Run targeted verification**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_events.py tests/test_cli.py tests/test_interceptor.py tests/test_approval.py tests/test_projection.py tests/test_playground_consumer_shape.py tests/test_smoke.py`
Expected: PASS

- [ ] **Step 6: Run broader runtime verification**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop pytest -q tests/test_binding.py tests/test_cli.py tests/test_event_log.py tests/test_events.py tests/test_interceptor.py tests/test_lock.py tests/test_projection.py tests/test_smoke.py`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop add \
  context_os_runtime/events.py \
  context_os_runtime/cli.py \
  context_os_runtime/interceptor.py \
  context_os_runtime/approval.py \
  context_os_runtime/projection.py \
  tests/test_events.py \
  tests/test_cli.py \
  tests/test_interceptor.py \
  tests/test_approval.py \
  tests/test_projection.py \
  tests/test_playground_consumer_shape.py \
  tests/test_smoke.py \
  IMPLEMENTATION_STATUS.md \
  AGENT_OS_ROADMAP.md
git -C /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop commit -m "feat: align runtime events with constitution"
```

## Self-Review

- Spec coverage:
  - Canonical envelope: Task 1
  - Ad hoc event replacement: Task 2
  - Approval and projection normalization: Task 3
  - Heartbeat and status reconstruction: Task 4
  - Tracking docs and next-slice sequencing: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Type consistency:
  - Uses `payload["project_id"]`, `payload["to_state"]`, `payload["action_hash"]`, `payload["capability"]`, `payload["requested_at"]`, `payload["expires_at"]`, and `payload["reason"]` consistently across tests and implementation steps.
