# Local Black Box Observability

Agent OS records a session-scoped flight recorder for every task. This document describes the system.

## Mental model

Think of it like an airplane's black box:

- **events.jsonl** — the tape. Append-only, never modified. Ground truth.
- **dashboard.json** — the instrument panel. Recomputed live from each event.
- **report.md** — the incident report. Written on demand by `/flight`.

The system is local-first, append-only, and requires no external service.

## Runtime layout

```
.agent-os/runtime/sessions/{session_id}/
├── events.jsonl     ← append-only JSONL tape
├── dashboard.json   ← live-projected health snapshot
└── report.md        ← last /flight output (markdown)
```

One directory per session. A session maps to one Pi process lifetime, anchored to one task via `session_id` stored in the task's `state.json`.

## Session continuity

When `/grill` creates a task, it writes `session_id` to `state.json`. All subsequent commands for that task (`/plan`, `/run`, `/verify`, `/remember`) read the stored `session_id` and write to the same session directory.

This means a complete GRILL → PLAN → RUN → VERIFY → REMEMBER arc appears as a single session in `/flight`.

## Event types captured

| Category | Events |
|---|---|
| Task lifecycle | `TASK_CREATED`, `TASK_STATE_TRANSITION`, `TASK_COMPLETED`, `TASK_FAILED`, `TASK_ABORTED` |
| Plan | `PLAN_CREATED`, `PLAN_APPROVED`, `PLAN_REJECTED` |
| Execution | `STEP_STARTED`, `STEP_COMPLETED`, `STEP_FAILED`, `COMMAND_STARTED`, `COMMAND_COMPLETED`, `COMMAND_FAILED` |
| Verification | `VERIFICATION_STARTED`, `VERIFICATION_PASSED`, `VERIFICATION_FAILED` |
| Memory | `KNOWLEDGE_CAPTURE_PROPOSED`, `KNOWLEDGE_CAPTURE_APPROVED`, `KNOWLEDGE_CAPTURE_REJECTED` |
| Brain | `BRAIN_QUERY`, `BRAIN_WRITE` |
| Liveness | `HEARTBEAT` (every 30s) |

## Health states

The projector classifies each session into one of five states:

| State | Condition |
|---|---|
| `HEALTHY` | Active, events recent |
| `DONE` | Terminal state (COMPLETED or ABORTED) |
| `FAILED` | Terminal failure state |
| `LOOPING` | Same state transition repeated ≥3 times |
| `STUCK` | Last event >90 seconds ago in a non-terminal state |

## Signals

The dashboard tracks three signals:

- **loop_detected** — same `from→to` transition occurs ≥3 times in a session
- **silent_failures** — count of COMMAND_FAILED and STEP_FAILED events
- **repeated_queries** — count of distinct brain query hashes fired ≥3 times

## Operator commands

```
/flight                         — most recent session timeline
/flight <session-uuid>          — specific session
/flight --tail 20               — show last 20 filtered events
/status                         — current task state + health summary
```

After `/flight`, a `report.md` is written to the session directory.

## Brain visibility

`BrainClient` (TypeScript) emits `BRAIN_QUERY` and `BRAIN_WRITE` events with:
- Query hash (first 8 chars of SHA-256)
- Result count and latency
- Content hash, confidence, and latency for writes

Brain events are visible in `/flight` output and count toward the `repeated_queries` signal.

## Liveness heartbeat

The Pi extension starts a 30-second interval on `session_start`. Each tick emits a `HEARTBEAT` event to the current task's session. This keeps `last_event_timestamp` fresh during long AI turns (plan drafting, verification) and prevents false `STUCK` classification.

## Architecture layers

```
Layer 1 — Trajectory Recorder
  emitAndProject() → events.jsonl + dashboard.json
  Called from: grill, plan, run, verify, remember, BrainClient

Layer 2 — Signals
  Projected inline by projector.ts
  loop_detected, silent_failures, repeated_queries
  Heartbeat from Pi extension session_start

Layer 3 — Dashboard CLI
  health.ts — classifyHealth()
  renderer.ts — renderTraceToString(), renderStatusToString(), writeReportMd()
  trace.ts — runTrace() → used by /flight
  status.ts — runStatus() → used by /status
```

## Source files

| File | Purpose |
|---|---|
| `src/core/projector.ts` | Core engine: emitAndProject, SessionDashboard type |
| `src/core/health.ts` | Health classification and age labels |
| `src/core/renderer.ts` | ANSI terminal render + markdown report writer |
| `src/core/runtime-paths.ts` | Session directory paths |
| `src/ccp/commands/trace.ts` | runTrace() — used by /flight |
| `src/ccp/brain/brain-events.ts` | Brain event builders |
