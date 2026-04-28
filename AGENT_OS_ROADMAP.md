# AGENT_OS_ROADMAP

Date: 2026-04-28
Scope: `context_os` as the reusable Agent OS control plane, with `knowledge-brain` as the memory substrate and consumer repos like `brain_playground` providing domain-specific manifests, policies, and local constraints.

## 1. Status Dashboard

This dashboard estimates implementation completion against the approved Phase 1 kernel boundary and the broader constitution/spec ambitions.

| Area | Completion | Current State | Main Gap |
|---|---:|---|---|
| Binding | 45% | Manifest loading, runtime version resolution, in-memory session record creation exist | No end-to-end `bind`, no constitution verification at bind time, no session snapshot persistence |
| CLI | 25% | `approve` is partially wired | No `bind`, `deny` is stubbed, `status` is placeholder-only |
| Skills | 15% | Registry and skill docs exist | Out of Phase 1 scope |
| Enforcement | 20% | Approval derivation and event logging primitives exist | Phase 1 only needs approval truth, not execution interception |
| Memory | 60% | Memory route model exists | Phase 1 only needs disk-truth compatibility, not new memory UX |

## 2. Prioritized Epics

The roadmap is organized into five phases. The sequence is intentional:

1. Foundation
   Build the minimum runtime loop so `context_os` can actually bind and manage a consumer repository.
2. Visibility
   Make runtime state understandable to humans before adding more automation.
3. Enforcement
   Turn advisory logic into actual control logic that can block unauthorized actions.
4. Orchestration
   Add skill discovery, lifecycle telemetry, and domain-agnostic execution routing.
5. Productization
   Make the system easy to install, verify, and operate for non-coders across different project types.

### Phase 1: Foundation

- Establish a real runtime session lifecycle from manifest to lock file to canonical event log.
- Convert `context_os` from a library of helpers into a runnable control-plane service.
- Preserve project agnosticism by keeping domain concerns in consumer manifests and policies, not in core runtime code.

### Phase 2: Visibility

- Build trustworthy observability around binding state, approval state, and memory routing.
- Make detached, active, and degraded states visible in plain language.
- Support both coder and non-coder operators with readable CLI output and health checks.

### Phase 3: Enforcement

- Wrap execution paths with real authorization checks.
- Enforce capability scopes consistently across domains such as trading, web development, and research workflows.
- Ensure violations are blocked, not merely logged.

### Phase 4: Orchestration

- Parse and execute the registry/protocol layer defined by the constitution.
- Support trigger-based skill loading and protocol-aware lifecycle transitions.
- Keep core orchestration generic so consumer repos can define their own critical actions and verification profiles.

### Phase 5: Productization

- Provide one-command setup and clear operator workflows.
- Add diagnostics, defaults, and docs that make Agent OS usable without reading source code.
- Make the same runtime usable for a trading repo one day and a web-app repo the next.

## 3. Detailed Tickets

### Phase 1: Foundation

#### Ticket F1.1: Implement a real bind command

Priority: P0

Problem:
Current binding logic only creates an in-memory `SessionBindingRecord`. The README promises a central runtime that binds a consumer repo and enforces deterministic state transitions, but the runtime does not yet perform that flow end-to-end.

Definition of Done:
- Add a `bind` subcommand to `context_os_runtime/cli.py`.
- `bind` must load `.agent-os.yaml`, call binding logic, write `.agent-os.lock`, and append a canonical `BINDING` event.
- Persist an atomic runtime session snapshot under `.agent-os/runtime/session.json`.
- Persist canonical events under `.agent-os/runtime/events.jsonl` or a clearly defined canonical path.
- Return a clear active/not-active result suitable for automation and humans.

Existing Code References:
- [context_os_runtime/binding.py:19](./context_os_runtime/binding.py#L19)
- [context_os_runtime/cli.py:42](./context_os_runtime/cli.py#L42)
- [context_os_runtime/lock.py:18](./context_os_runtime/lock.py#L18)
- [context_os_runtime/events.py:7](./context_os_runtime/events.py#L7)
- [README.md:83](./README.md#L83)

#### Ticket F1.2: Persist and validate runtime session state

Priority: P0

Problem:
The runtime has a state enum and transition helper, but no persisted session state model or log-driven state reconstruction.

Definition of Done:
- Add a persisted session state file format and reader/writer helpers.
- Record current canonical state after bind and after each state transition.
- Support reconstruction from canonical log when the snapshot is missing or stale.
- Keep the implementation project-agnostic by deriving state from generic session/action events rather than trading-specific semantics.

Existing Code References:
- [context_os_runtime/state.py:6](./context_os_runtime/state.py#L6)
- [context_os_runtime/events.py:13](./context_os_runtime/events.py#L13)
- [context_os_runtime/models.py:20](./context_os_runtime/models.py#L20)

#### Ticket F1.3: Standardize canonical event schema usage in runtime code

Priority: P0

Problem:
Events are appended as free-form dictionaries. The constitution expects strongly defined event classes and observability guarantees.

Definition of Done:
- Add typed event constructors or schema-backed helpers for `BINDING`, `STATE_TRANSITION`, `ACTION_REQUESTED`, `HUMAN_APPROVAL_RECEIVED`, `HUMAN_APPROVAL_DENIED`, `SYSTEM_AUTO_REJECTED`, `EXECUTION_STARTED`, `PERMISSION_DENIED`, and `VIOLATION`.
- Ensure all runtime event writes flow through one helper layer.
- Add tests covering required fields and event ordering constraints.

Existing Code References:
- [context_os_runtime/events.py:7](./context_os_runtime/events.py#L7)
- [AGENT_OS_CONSTITUTION.md:89](./AGENT_OS_CONSTITUTION.md#L89)
- [AGENT_OS_CONSTITUTION.md:225](./AGENT_OS_CONSTITUTION.md#L225)

#### Ticket F1.4: Wire projection mirroring into canonical approval flows

Priority: P0

Problem:
Approval projection support exists, but `approve_command()` does not currently invoke it. The mirror helper is isolated and best-effort only.

Definition of Done:
- After canonical approval/deny/expiry events are appended, call projection mirroring automatically.
- Store projection rows in a clearly documented DB path derived from the active memory route.
- Preserve failure isolation: canonical write succeeds even if projection write fails.

Existing Code References:
- [context_os_runtime/cli.py:15](./context_os_runtime/cli.py#L15)
- [context_os_runtime/projection.py:8](./context_os_runtime/projection.py#L8)
- [context_os_runtime/memory_router.py:18](./context_os_runtime/memory_router.py#L18)

### Phase 2: Visibility

#### Ticket V2.1: Replace placeholder status command with real active/detached views

Priority: P0

Problem:
`status` currently always prints detached/no sessions. The spec expects active and historical views with fallback behavior.

Definition of Done:
- Implement `context-os status` and `context-os status --watch`.
- When lock is valid, display active project/session identity, canonical state, current action status, and memory route summary.
- When lock is missing/stale, scan the canonical log and display detached/historical view.
- If no events exist, display `NO SESSIONS FOUND`.
- Add tests for active, detached, and empty-history scenarios.

Existing Code References:
- [context_os_runtime/cli.py:36](./context_os_runtime/cli.py#L36)
- [context_os_runtime/cli.py:58](./context_os_runtime/cli.py#L58)
- [docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md:384](./docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md#L384)

#### Ticket V2.2: Add a doctor command for non-coder setup and diagnosis

Priority: P0

Problem:
The project currently assumes users understand manifests, DB paths, MCP setup, and lock semantics. That is too fragile for broad adoption.

Definition of Done:
- Add `context-os doctor`.
- Report manifest presence/validity, constitution verification, lock freshness, canonical log presence, memory route validity, `brain` CLI availability, and MCP readiness where detectable.
- Output must include human-readable fixes, not just raw failures.

Existing Code References:
- [scripts/verify_agent_os_bundle.py:46](./scripts/verify_agent_os_bundle.py#L46)
- [README.md:90](./README.md#L90)
- [context_os_runtime/manifest.py:10](./context_os_runtime/manifest.py#L10)

#### Ticket V2.3: Expose canonical vs projection approval state in one dashboard

Priority: P1

Problem:
The spec distinguishes command authority from read-only observability, but the runtime lacks a unified status surface for both.

Definition of Done:
- Status output must show canonical approval state and mirrored projection state side by side.
- Show blocked explanations when projection says approved but canonical session authority is missing.
- Add tests for mismatched-source visualization.

Existing Code References:
- [context_os_runtime/approval.py:17](./context_os_runtime/approval.py#L17)
- [context_os_runtime/projection.py:8](./context_os_runtime/projection.py#L8)
- [docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md:403](./docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md#L403)

#### Ticket V2.4: Add heartbeat and degraded-state reporting

Priority: P1

Problem:
The constitution requires heartbeats and degraded-state semantics. No runtime heartbeat loop exists.

Definition of Done:
- Emit `HEARTBEAT` events while ACTIVE according to the constitution cadence.
- Track missed heartbeats and expose `SUSPECT`/`DEGRADED` state transitions.
- Ensure heartbeat logic remains generic and does not depend on a specific project domain.

Existing Code References:
- [AGENT_OS_CONSTITUTION.md:236](./AGENT_OS_CONSTITUTION.md#L236)
- [context_os_runtime/state.py:31](./context_os_runtime/state.py#L31)

### Phase 3: Enforcement

#### Ticket E3.1: Implement deny command and canonical denial flow

Priority: P0

Problem:
`deny` is explicitly stubbed.

Definition of Done:
- Add `context-os deny <hash> --reason <text>`.
- Validate active lock exactly as `approve` does.
- Append `HUMAN_APPROVAL_DENIED` to canonical log.
- Mirror denial into the approval projection store.
- Add tests for detached-session rejection and denial projection behavior.

Existing Code References:
- [context_os_runtime/cli.py:47](./context_os_runtime/cli.py#L47)
- [context_os_runtime/cli.py:57](./context_os_runtime/cli.py#L57)
- [docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md:370](./docs/superpowers/specs/2026-04-27-safety-operating-layer-design.md#L370)
