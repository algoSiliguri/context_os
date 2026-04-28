# Phase 1 Control Plane Credibility Design

Date: 2026-04-28
Status: Proposed
Scope: `context_os` Phase 1 kernel boundary, delivery slices, and durable tracking model

## 1. Purpose

Define the first usable release boundary for `context_os` as a domain-agnostic Agent OS control plane.

This design is intentionally narrow. It does not attempt to build the full aspirational system described by `AGENT_OS_CONSTITUTION.md`. Instead, it identifies the smallest complete kernel that proves Agent OS is:

- authoritative
- durable on disk
- replayable from canonical artifacts
- generic across project types

The goal of Phase 1 is credibility, not feature breadth.

## 2. Problem Statement

`context_os` currently has a constitution, bundle verification, approval derivation, lock validation primitives, event append helpers, and manifest-aware binding logic. However, those pieces do not yet form a complete control plane.

The current gaps are structural:

- binding is not an end-to-end runtime command
- session truth is not durably and atomically persisted
- canonical events are not emitted through one strict model
- deny and expiry behavior are incomplete
- status is not a truthful disk-backed runtime view
- consumer compatibility is not yet validated as a generic contract

If orchestration work such as skill loading or protocol runners is added before this kernel is complete, the system will mix runtime truth with higher-level workflow behavior too early.

## 3. Design Decision

Phase 1 shall be defined as `Control Plane Credibility`.

Success for this release means:

- a generic repository can bind to `context_os`
- the bind verifies governing authority before activation
- runtime state is durably persisted to disk
- canonical events are emitted and replayable
- approval and denial states are modeled consistently
- status can reconstruct truth from disk without hidden in-memory state

Phase 1 explicitly excludes:

- skill discovery and auto-loading
- protocol orchestration
- `doctor`
- `status --watch`
- projection dashboards and broad operator UX

Those belong after the kernel is trustworthy.

## 4. Tracking Model

The implementation should be tracked through three distinct repository documents.

### 4.1 `AGENT_OS_CONSTITUTION.md`

This is the stable governing target. It should change only when Agent OS rules or invariants change.

It must not become a delivery tracker.

### 4.2 `AGENT_OS_ROADMAP.md`

This is the planning artifact. It should hold:

- phased backlog
- ticket IDs
- priorities
- acceptance criteria
- sequencing across phases

It is the forward-looking plan, not the authoritative statement of what is already shipped.

### 4.3 `IMPLEMENTATION_STATUS.md`

This should be added as the living shipped-state tracker.

Its purpose is to make new chat sessions recoverable from repository state alone. A new session should be able to read this file and quickly answer:

- what milestone is active
- which tickets are not started, in progress, merged, verified, or blocked
- which files define runtime truth today
- what PR landed last
- what the next smallest coherent PR should be

Recommended structure:

1. Current milestone
2. Last updated date and latest merged commit or PR
3. Phase checklist table mapped to roadmap ticket IDs
4. Runtime truth files
5. Open P0 blockers
6. Recent merged changes
7. Next recommended slice

Recommended statuses:

- `Not started`
- `In progress`
- `Merged`
- `Verified`
- `Blocked`

This file should be updated in every Phase 1 PR together with `AGENT_OS_ROADMAP.md`.

## 5. Phase 1 Scope

Phase 1 includes only the kernel capabilities required to make `context_os` a real control plane.

### 5.1 Included

- constitution-verified `bind`
- atomic persistence of lock, session snapshot, and canonical events
- canonical event schema and helper layer
- approval lifecycle completeness
- accurate `status` using active or detached disk reconstruction
- generic `.agent-os.yaml` compatibility for arbitrary repositories
- strong tests for state truth, replay, and lifecycle correctness

### 5.2 Excluded

- skill registry parsing
- skill load and unload lifecycle
- protocol runners
- operator diagnostics beyond kernel truth
- rich dashboards
- domain-specific adapters

## 6. Architectural Principles

The following principles govern this phase.

### 6.1 Disk Truth Over Process Truth

All runtime truth needed for status and authorization must be derivable from persisted artifacts, not hidden memory.

### 6.2 Authority Before Convenience

The runtime may expose convenient commands, but they must always be backed by constitution verification and canonical state, never by shortcuts.

### 6.3 Domain-Agnostic Core

`context_os` must not embed trading, web development, or research assumptions in the core runtime. Consumer repositories may declare constraints and critical actions, but the kernel must stay generic.

### 6.4 Canonical Log Is Primary

The append-only canonical event log is the source of execution truth. Lockfiles, snapshots, projections, and dashboards are convenience layers.

### 6.5 Kernel Before Orchestration

Workflow concerns such as skills and protocols must wait until binding, persistence, events, status, and approval semantics are stable.

## 7. Phase 1 Capability Boundary

The Phase 1 kernel is complete only when all of the following are true.

### 7.1 Bind and Authority

- `bind` loads and validates `.agent-os.yaml`
- `bind` verifies the governing bundle and constitution prerequisites
- binding fails cleanly when authority is invalid
- successful binding creates a governed active session

### 7.2 Runtime Persistence

- `.agent-os.lock` is written as a convenience artifact
- `.agent-os/runtime/session.json` stores the current session snapshot
- `.agent-os/runtime/events.jsonl` stores canonical append-only events
- writes are atomic enough that crash recovery does not produce ambiguous truth

### 7.3 Canonical Events

- runtime event emission flows through a common helper layer
- event shapes are consistent and replayable
- the event family supports approval lifecycle and session transitions

### 7.4 Approval Lifecycle

At minimum, the runtime must model:

- `requested`
- `approved`
- `denied`
- `expired`
- `not-actionable`

These semantics must come from canonical disk state rather than projection state or temporary memory.

### 7.5 Truthful Status

- active sessions must be readable from current persisted artifacts
- stale or missing lockfiles must not destroy observability
- detached status must reconstruct from the canonical log
- no status path may depend on process-local hidden state

### 7.6 Generic Consumer Compatibility

The runtime must accept a domain-neutral `.agent-os.yaml` contract that can represent different repository types without changing core logic.

## 8. Phase 1 Delivery Slices

Phase 1 should be delivered as six small PR-sized slices.

### 8.1 `P1-S1` Constitution-Verified Bind

Deliver:

- real `bind` command
- consumer manifest load and validation
- constitution and bundle verification during bind
- active session creation
- initial `BINDING` event

Why first:

- no later feature is trustworthy until authority is explicit and verifiable

### 8.2 `P1-S2` Atomic Runtime Persistence

Deliver:

- canonical runtime storage layout
- atomic write helpers for lock, session snapshot, and event log
- crash-safe update rules where feasible

Why second:

- bind must persist durable truth before additional lifecycle behavior is added

### 8.3 `P1-S3` Canonical Event Model

Deliver:

- typed or schema-backed event constructors
- event helper layer shared across runtime commands
- normalized session transition emissions

Why third:

- approval and status logic should depend on one event contract, not scattered dict writes

### 8.4 `P1-S4` Approval Lifecycle Completeness

Deliver:

- request, approve, deny, expire, and not-actionable state derivation
- canonical denial flow
- expiry semantics grounded in canonical log history

Why fourth:

- the event substrate must exist before approval semantics are expanded

### 8.5 `P1-S5` Truthful Status

Deliver:

- real active session status
- detached reconstruction from canonical artifacts
- error-safe reporting for stale or missing lockfiles

Why fifth:

- truthful status is only possible after persistence and lifecycle rules are stable

### 8.6 `P1-S6` Generic Consumer Compatibility and Verification

Deliver:

- tightened `.agent-os.yaml` validation
- generic critical action modeling
- verification tests covering replay, reconstruction, bind, and approval lifecycle

Why sixth:

- compatibility hardening and verification are the final closure step for the kernel release

## 9. Acceptance Criteria

Phase 1 is complete when the following can be demonstrated in a generic repository:

1. A repository with a valid `.agent-os.yaml` can bind successfully.
2. A repository with invalid authority fails bind with a clear error.
3. Binding produces a valid lock, session snapshot, and canonical binding event.
4. A critical action request can be recorded and later approved or denied.
5. Expired requests are not executable and are represented consistently.
6. `status` reports the correct active session when the lock is valid.
7. `status` reconstructs a detached but truthful view when the lock is stale or missing.
8. The same runtime logic applies regardless of whether the consumer repo is trading-related, web-related, or generic.

## 10. Risks and Guardrails

### 10.1 Risks

- allowing roadmap or progress notes to leak into the constitution
- shipping convenience commands before authority semantics stabilize
- using projection or memory state as execution truth
- letting domain-specific assumptions leak into manifest validation or critical action handling

### 10.2 Guardrails

- keep authority logic and workflow logic separate
- update `IMPLEMENTATION_STATUS.md` on every Phase 1 PR
- treat canonical events and session artifacts as the only runtime truth
- delay skills and protocols until the kernel acceptance criteria pass

## 11. Recommended Immediate Follow-Up

After this design is accepted:

1. Align `AGENT_OS_ROADMAP.md` to the exact Phase 1 boundary defined here.
2. Add `IMPLEMENTATION_STATUS.md` using the hybrid ticket-mapped status format.
3. Convert the six Phase 1 slices into exact PR tickets with acceptance criteria and test expectations.
