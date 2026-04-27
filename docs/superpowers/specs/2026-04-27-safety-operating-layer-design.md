# Safety Operating Layer Design

Date: 2026-04-27
Status: Proposed
Scope: `context_os` canonical safety flow, `knowledge-brain` approval projection, `brain_playground` consumer verification

## 1. Purpose

Define a Human-in-the-Loop safety operating layer that keeps authorization deterministic, observable, and easy to use across thin domain repositories.

This design introduces:

- capability-based critical action gating
- per-instance human approval keyed to an action hash
- temporal expiry with hard invalidation
- canonical event-driven authorization in `context_os`
- mirrored approval projection in `knowledge-brain`
- a command/query CLI split with lock-based convenience and detached historical status

The design applies first to `brain_playground` as the reference consumer, but the runtime behavior is domain-agnostic.

## 2. Goals

- prevent execution of critical actions without explicit human approval
- make approvals valid only for one exact action instance
- prevent stale approvals from authorizing delayed execution
- keep authorization independent of `knowledge-brain` availability
- provide a single `context-os status --watch` command for non-coder visibility
- preserve thin consumer repositories by keeping safety logic in `context_os`

## 3. Non-Goals

- no session-wide unlocks for critical capabilities
- no database dependency for canonical authorization
- no soft retries of expired or denied actions
- no cross-session reuse of approvals
- no mixing approvals projection with primary knowledge node storage semantics

## 4. Architectural Position

The system is split into command authority and read-only observability:

- `context_os` is the control plane and canonical authority
- `knowledge-brain` is the observability projection plane
- `brain_playground` is a thin consumer that declares policy through manifest configuration

Critical rule:

- only the canonical `context_os` repo log may authorize execution
- `knowledge-brain` may report approval history but may never authorize future execution

## 5. Manifest Contract

Each domain repository continues to declare identity and policy in `.agent-os.yaml`.

New and clarified fields:

- `verification_profile`: preset profile name
- `critical_actions`: optional list of capability names
- `global_memory_read`: existing boolean
- `global_memory_write`: existing boolean

Example:

```yaml
project_id: brain-playground
domain_type: trading-research
runtime_version: 0.1.x
memory_namespace: brain-playground
verification_profile: production
project_constitution: docs/architecture/consumer-runtime.md
global_memory_read: true
global_memory_write: false
critical_actions:
  - global_memory_write
  - external_api_call
  - trade_execute
```

Preset baseline:

- `sandbox`: no critical actions
- `research`: `external_api_call`, `global_memory_write`
- `production`: `external_api_call`, `global_memory_write`, `trade_execute`, `deploy`

Effective critical actions are derived from the preset and narrowed or extended by `critical_actions`.

## 6. Session and Lock Model

### 6.1 Canonical Log

Each repository has one append-only canonical event log containing records for many sessions. Every event record must include:

- `session_id`
- `timestamp`
- `event_type`

The log is the sole authorization authority.

### 6.2 Lockfile Convenience Layer

`context_os` creates a JSON `.agent-os.lock` containing:

- `session_id`
- `project_id`
- `repo_root`
- `log_path`

The lockfile is a convenience cache only. It is not authoritative.

`validate_lock()` must confirm:

- the referenced repo root still matches the current working repo
- the manifest project identity still matches
- the referenced session exists in the canonical log as an active/open session

If validation fails, the lock is stale.

## 7. ActionRequest Model

Introduce a deterministic `ActionRequest` data model with:

- `session_id`
- `action_hash`
- `capability`
- `params_digest_source`
- `requested_at`
- `expires_at`
- `invalidated_at` optional
- `invalidation_reason` optional

### 7.1 Hashing Rule

`action_hash` must be computed from the resolved tool arguments, not the raw user prompt.

This prevents approval of a prompt-level description while execution later uses modified parameters.

### 7.2 Temporal Safety

Every critical action must have a finite TTL. If `now > expires_at`, the request is no longer executable and must be invalidated through the canonical log.

## 8. State Model

### 8.1 Session States

The runtime state machine shall include:

- `BOUND`
- `IDLE`
- `PLANNED`
- `AWAITING_APPROVAL`
- `EXECUTING`
- `EXECUTED`
- `VERIFIED`
- `REVIEWED`
- `COMPLETE`

`IDLE` represents a safe resting state after bind, denial, expiry, or post-action reset.

### 8.2 Approval-Related Transitions

- `BOUND -> IDLE`
- `IDLE -> PLANNED`
- `PLANNED -> AWAITING_APPROVAL`
  - when a critical action is requested
- `AWAITING_APPROVAL -> EXECUTING`
  - only if a matching approval exists in the canonical log for the current session and the action is not expired or blacklisted
- `AWAITING_APPROVAL -> IDLE`
  - if a matching denial exists
  - if the action expires and is auto-rejected
- `EXECUTING -> EXECUTED`
- `EXECUTED -> VERIFIED`
- `VERIFIED -> REVIEWED` or `COMPLETE`
- `REVIEWED -> COMPLETE`

The runtime must never move to `EXECUTING` or `COMPLETE` by consulting projection data alone.

## 9. Canonical Event Schema

### 9.1 Event Family

The canonical approval and execution event family is:

- `ACTION_REQUESTED`
- `HUMAN_APPROVAL_RECEIVED`
- `HUMAN_APPROVAL_DENIED`
- `SYSTEM_AUTO_REJECTED`
- `EXECUTION_STARTED`

### 9.2 Required Payloads

`ACTION_REQUESTED`

- `session_id`
- `timestamp`
- `event_type`
- `action_hash`
- `capability`
- `params_digest_source`
- `requested_at`
- `expires_at`

`HUMAN_APPROVAL_RECEIVED`

- `session_id`
- `timestamp`
- `event_type`
- `action_hash`
- `approver_meta`

`HUMAN_APPROVAL_DENIED`

- `session_id`
- `timestamp`
- `event_type`
- `action_hash`
- `reason`
- `approver_meta`

`SYSTEM_AUTO_REJECTED`

- `session_id`
- `timestamp`
- `event_type`
- `action_hash`
- `reason`

`EXECUTION_STARTED`

- `session_id`
- `timestamp`
- `event_type`
- `action_hash`
- `capability`

### 9.3 Write-Ahead Logging Rule

For a critical action, `EXECUTION_STARTED` must be appended immediately before invoking the tool.

This preserves crash-safe evidence that execution began even if the process dies before completion.

## 10. Authorization Derivation

Authorization is derived by scanning the canonical log for one `session_id` and one `action_hash`.

Derived statuses:

- `pending`: request exists, no terminal event yet
- `approved`: matching `HUMAN_APPROVAL_RECEIVED` exists, no later terminal invalidation
- `denied`: matching `HUMAN_APPROVAL_DENIED` exists
- `expired`: matching `SYSTEM_AUTO_REJECTED` exists
- `blacklisted`: any hash with `denied` or `expired`
- `executable`: approved and not blacklisted and not expired and within TTL and matching current session

Rules:

- approvals from a different `session_id` do not count
- approvals found only in `knowledge-brain` do not count
- a blacklisted hash remains permanently invalid for that session
- a later approval event for a blacklisted hash must be ignored for execution authorization

## 11. Harness Interceptor

`context_os` introduces an execution wrapper around critical capabilities.

Flow:

1. resolve the concrete tool arguments
2. compute `action_hash`
3. determine whether the capability is in effective `critical_actions`
4. if not critical, continue through the normal path
5. if critical and not executable:
   - append `ACTION_REQUESTED`
   - transition to `AWAITING_APPROVAL`
   - halt execution
6. if critical and executable:
   - append `EXECUTION_STARTED`
   - transition to `EXECUTING`
   - call the tool

If an action expires while awaiting approval:

- append `SYSTEM_AUTO_REJECTED`
- mark the hash invalid for the session
- transition back to `IDLE`
- inject a runtime system message instructing the agent to re-evaluate and generate a fresh request

If a human denies the action:

- append `HUMAN_APPROVAL_DENIED`
- mark the hash invalid for the session
- transition back to `IDLE`
- inject the same style of system message

Required feedback text shape:

`Action <hash> expired/denied; approval is no longer valid; re-evaluate environment and generate a fresh request if necessary.`

## 12. Namespace Isolation

`knowledge-brain` must enforce namespace isolation for writes.

Rule:

- a project may write only to the namespace declared in its bound manifest
- if `global_memory_write` is false, the runtime path must physically lack the ability to call a global write route

Implications:

- `context_os` computes the allowed memory route during binding
- write paths receive bound namespace information explicitly
- attempts to write outside the declared namespace must fail closed
- the failure must append a `SECURITY_VIOLATION` event to the canonical log

This prevents contamination between thin consumer repositories.

## 13. Projection Model in `knowledge-brain`

Approvals projection is implemented in a sibling module, not in the knowledge node store.

Suggested module:

- `knowledge_brain/approval_store.py`

Suggested table columns:

- `session_id`
- `action_hash`
- `namespace`
- `capability`
- `requested_at`
- `expires_at`
- `approved_at`
- `denied_at`
- `invalidated_at`
- `final_status`
- `reason`
- `approver_meta_json`

`final_status` values:

- `APPROVED`
- `DENIED`
- `EXPIRED`

Mirroring rules:

- `HUMAN_APPROVAL_RECEIVED -> APPROVED`
- `HUMAN_APPROVAL_DENIED -> DENIED`
- `SYSTEM_AUTO_REJECTED -> EXPIRED`

Projection writes are best-effort:

- canonical log append happens first
- projection mirror happens after
- if projection write fails, authorization safety is unaffected

## 14. CLI Contract

The CLI is split into command operations and query operations.

### 14.1 Command Operations

`context-os approve <hash>`

- requires a valid `.agent-os.lock`
- appends `HUMAN_APPROVAL_RECEIVED` to the canonical log
- triggers projection mirroring

`context-os deny <hash> --reason <text>`

- requires a valid `.agent-os.lock`
- appends `HUMAN_APPROVAL_DENIED` to the canonical log
- triggers projection mirroring

If the runtime is detached or the lock is stale, command operations must fail closed with:

`Error: Cannot approve in a detached session. Please re-bind the project.`

The same rule applies to deny.

### 14.2 Query Operation

`context-os status --watch`

Fallback order:

1. validate `.agent-os.lock`
2. if valid, display the Active dashboard
3. if missing or stale, scan the canonical log for the most recent session
4. if found, display the Detached/Historical dashboard
5. if no log records exist, display `NO SESSIONS FOUND`

The status view must:

- show bound project identity
- show session identity
- show current runtime state from the canonical log
- show current or last pending action status
- show recent approval projection state from `knowledge-brain`
- show the last 5 memory entries for the current namespace when available

### 14.3 Mismatched Source Visualization

If projection data shows an approval but the active session canonical log does not, the CLI must show a blocked explanation such as:

- `canonical state: AWAITING_APPROVAL`
- `projection state: APPROVED`
- `effective execution state: BLOCKED (missing canonical approval for current session)`

This explains historical approvals without weakening session integrity.

### 14.4 ANSI Presentation

When attached to a TTY, the CLI uses ANSI coloring:

- `APPROVED`: green
- `PENDING`: yellow
- `DENIED` and `EXPIRED`: red
- Detached/Historical header: dim or visually muted

When not attached to a TTY, output remains plain text.

## 15. Implementation Units

### 15.1 `context_os/context_os_runtime/events.py`

Responsibilities:

- event schema definitions
- append-only log helper
- log read/scan helpers

### 15.2 `context_os/context_os_runtime/approval.py`

Responsibilities:

- derive approval status from canonical log
- enforce `Executable = Approved AND NOT Blacklisted AND NOT Expired AND session_id match`

### 15.3 `context_os/context_os_runtime/interceptor.py`

Responsibilities:

- wrap critical tool execution
- compute action hash from resolved arguments
- emit `ACTION_REQUESTED`
- halt or continue based on canonical authorization
- emit `EXECUTION_STARTED` before tool invocation

### 15.4 `context_os/context_os_runtime/projection.py`

Responsibilities:

- best-effort mirror of approval events into `knowledge-brain`
- failure isolation around projection writes

### 15.5 `context_os/context_os_runtime/lock.py`

Responsibilities:

- read/write `.agent-os.lock`
- validate cached session binding against manifest and canonical log

### 15.6 `knowledge-brain/knowledge_brain/approval_store.py`

Responsibilities:

- standalone SQLite projection for approval lifecycle
- no interference with knowledge node storage behavior

## 16. Verification Requirements

### 16.1 Unit Tests

- state derivation from canonical log without database involvement
- transition rules for `AWAITING_APPROVAL`
- blacklist behavior after deny or expiry
- lock validation behavior

### 16.2 Integration Tests

- `context-os approve <hash>` appends canonical event and creates or updates projection row
- `context-os deny <hash>` mirrors `DENIED`
- `status --watch` shows Active and Detached behavior correctly

### 16.3 Temporal Test

- create a critical action with a 5-second TTL
- wait 6 seconds
- verify `SYSTEM_AUTO_REJECTED` is written
- verify session returns to `IDLE`
- verify the agent must generate a fresh request rather than reuse the old hash

### 16.4 Replay Protection Test

- record an approval for one session
- start a new session
- verify projection history alone does not authorize execution in the new session

### 16.5 Crash Test

- simulate a crash after `EXECUTION_STARTED` is logged but before tool completion
- verify the log still proves execution was initiated

### 16.6 Resilience Test

- simulate SQLite projection failure
- verify canonical log append still succeeds
- verify an otherwise valid approved critical action may still execute

### 16.7 Security Violation Test

- simulate a bad actor domain repo attempting a disallowed global memory write
- verify `context_os` blocks the action
- verify a `SECURITY_VIOLATION` event is written

## 17. Consumer Shape Expectation

`brain_playground` remains a thin manifest-driven consumer.

It must not regain duplicated framework governance files merely to support HITL. The safety operating layer is owned by `context_os`, with `brain_playground` supplying only project policy, local docs, configs, and tests that verify consumer behavior.

## 18. Recommendation

Implement the Safety Operating Layer in `context_os` as the deterministic authority, keep `knowledge-brain` as a best-effort projection and observability plane, and preserve thin consumer repositories as the scaling mechanism across domains.
