# Constitution Event Alignment Design

Date: 2026-04-28
Status: Proposed
Scope: `context_os` runtime event contract alignment for the active Phase 2 visibility branch

## 1. Purpose

Align the shipped runtime event layer with `AGENT_OS_CONSTITUTION.md` so persisted runtime telemetry uses one canonical envelope and constitution-aligned event families.

This slice fixes the current mismatch where the runtime is visible and disk-backed, but still emits ad hoc event names and free-form payloads such as:

- `SESSION_BOUND`
- `SESSION_IDLE`
- `SECURITY_VIOLATION`

The goal is to make runtime truth more credible without expanding into orchestration or broader enforcement work.

## 2. Goals

- move runtime event emission behind one shared helper layer
- emit constitution-aligned envelope fields on persisted events
- replace ad hoc visibility/runtime event names with canonical event families
- preserve current approval and visibility behavior on the existing branch
- keep the runtime project-agnostic
- add builder coverage for `SKILL_LOAD` and `SKILL_UNLOAD` for completeness without adding skill execution

## 3. Non-Goals

- no skill orchestration runtime
- no capability-token system
- no full JSON Schema validation pipeline in this slice
- no background daemon or long-running heartbeat service
- no migration of historical event logs already written by old branches

## 4. Problem Statement

The current `feat/safety-visibility-loop` branch already has:

- `.agent-os/runtime/events.jsonl`
- bind/approve/deny/status/doctor flows
- heartbeat visibility in `status`

However, the event model is internally inconsistent:

- `events.py` appends arbitrary dictionaries
- `cli.py` emits `SESSION_BOUND` and `SESSION_IDLE`
- `interceptor.py` emits `SECURITY_VIOLATION`
- status reconstruction depends on those ad hoc names
- tests freeze those ad hoc names

This conflicts with the constitution’s telemetry contract, which requires a shared envelope and named event classes such as `BINDING`, `STATE_TRANSITION`, `HEARTBEAT`, `PERMISSION_DENIED`, and `VIOLATION`.

## 5. Design Decision

Introduce a canonical event helper layer in `context_os_runtime/events.py` and route all runtime event writes through it.

The helper layer will:

- stamp every event with the constitution envelope fields needed by this runtime
- centralize event construction
- expose focused builders for the currently used event families
- keep append/read concerns separate from event semantics

This is a writer-first cleanup. Readers in `status`, `approval`, and safety guards will be updated in the same slice so the branch remains internally consistent.

## 6. Canonical Event Envelope

Each persisted event will include:

- `event_id`
- `event_type`
- `session_id`
- `trace_id`
- `span_id`
- `parent_span_id`
- `system_id`
- `constitution_version`
- `harness_id`
- `timestamp`
- `payload`

Implementation notes:

- `system_id` will be `agent-os`
- `constitution_version` will be `v2`
- `harness_id` will be a stable local value for this runtime branch
- `payload` will contain the event-specific fields currently spread across top-level dicts

This slice will not add full schema validation. It will normalize structure first.

## 7. Event Family Mapping

### 7.1 Replaced ad hoc runtime events

- `SESSION_BOUND` becomes `BINDING`
- `SESSION_IDLE` becomes `STATE_TRANSITION` with `to_state=IDLE`
- `SECURITY_VIOLATION` becomes `PERMISSION_DENIED` for denied namespace writes

### 7.2 Existing approval and execution events

These stay in use, but are emitted through the same canonical helper layer:

- `ACTION_REQUESTED`
- `HUMAN_APPROVAL_RECEIVED`
- `HUMAN_APPROVAL_DENIED`
- `SYSTEM_AUTO_REJECTED`
- `EXECUTION_STARTED`

They are not listed in the constitution’s minimum telemetry class set, but they are already part of the repo’s shipped approval lifecycle and should be normalized rather than left as free-form exceptions.

### 7.3 Completeness builders

Add builders for:

- `SKILL_LOAD`
- `SKILL_UNLOAD`
- `VIOLATION`

These builders may be unused by runtime flow today, but they should exist so the event layer is no longer incomplete by construction.

## 8. Runtime Read Model Changes

### 8.1 Status reconstruction

`status_snapshot()` should reconstruct workflow state from:

- `BINDING`
- `STATE_TRANSITION`
- `ACTION_REQUESTED`
- `EXECUTION_STARTED`
- approval terminal events
- `HEARTBEAT`

It must stop depending on raw ad hoc names like `SESSION_IDLE`.

### 8.2 Approval derivation

`derive_action_status()` should continue to derive approval truth from canonical event history, but it should read normalized top-level envelope plus event payload instead of assuming every business field is at the top level.

### 8.3 Safety denial behavior

The existing global namespace block should emit `PERMISSION_DENIED`, not `SECURITY_VIOLATION`, because the current behavior denies one action rather than invalidating the whole session.

`VIOLATION` remains available for future truly constitutional invalidation paths.

## 9. Backward Compatibility

This slice only needs to keep the active branch internally coherent.

Decision:

- update current tests and runtime reads to the canonical event contract
- do not add indefinite dual-format support for old ad hoc runtime events unless a failing test proves it is necessary inside this worktree

That keeps the change set smaller and prevents permanent compatibility clutter.

## 10. Testing Strategy

Use TDD.

Add or update tests for:

- canonical envelope fields on emitted events
- bind emitting `BINDING` and `STATE_TRANSITION` instead of `SESSION_*`
- heartbeat events preserving the canonical envelope
- status reconstruction from canonical `STATE_TRANSITION`
- namespace guard emitting `PERMISSION_DENIED`
- helper coverage for `SKILL_LOAD` and `SKILL_UNLOAD`

Verification should stay targeted to:

- `tests/test_events.py`
- `tests/test_cli.py`
- `tests/test_interceptor.py`
- `tests/test_approval.py`
- `tests/test_projection.py`

## 11. PR Boundary

This should remain one PR-sized slice with the following file focus:

- `context_os_runtime/events.py`
- `context_os_runtime/cli.py`
- `context_os_runtime/interceptor.py`
- `context_os_runtime/approval.py`
- relevant runtime tests
- tracking docs

It should not pull in:

- skill execution
- new daemons
- manifest redesign
- capability-token enforcement

## 12. Next Slice After This

If this event-contract slice lands cleanly, the next smallest follow-up should be project-agnostic critical-action baseline cleanup so `context_os` stops carrying trading-specific baseline assumptions in core runtime profiles.
