# CONTEXT.md — Domain Glossary

The vocabulary this codebase uses. Future agents (Claude, Codex, Pi, etc.)
working in this repo should ground their output in these terms — and
flag if they're inventing new ones.

## Layers (from constitution v2)

- **L0 — Constitution.** `AGENT_OS_CONSTITUTION.md`. Sole governing authority.
- **L1 — Harness Adapter.** `CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`. Non-authoritative.
- **L2 — Execution Layer.** Skills, agents, the CCP itself. Subordinate to L0.
- **L3 — Memory.** `knowledge-brain` via CLI (Tier 1) or MCP (Tier 2).

## Sessions vs Tasks

- **Session.** Bound agent-os runtime instance. Created when Pi starts and
  binding succeeds (constitution `[B5]`). Identified by `session_id`.
- **Task.** A unit of work inside a session. What `/grill` creates. Identified
  by `task_id` (sequential `T-NNN` per project). The 14-state CCP state
  machine is per-task.

In v1 there is **one active task per session**. Switching tasks happens in a
fresh Pi session.

## State machine (per task)

Main flow:
`NEW_IDEA → GRILLING → SHARED_UNDERSTANDING → PLANNING → AWAITING_PLAN_APPROVAL
→ EXECUTING ⇄ AWAITING_TOOL_APPROVAL → VERIFYING → AWAITING_HUMAN_REVIEW
→ EVALUATING → PERSISTING_KNOWLEDGE → COMPLETED`

Quick-task branch: `NEW_IDEA → QUICK_TASKING → AWAITING_HUMAN_REVIEW` (or `FAILED_RECOVERABLE`)

Diagnose branch: `NEW_IDEA → DIAGNOSING → SHARED_UNDERSTANDING`

Side states: `FAILED_RECOVERABLE`, `FAILED_BLOCKED`, `ABORTED`.

## Task lifecycle

The Task lifecycle Module owns task birth and transition mechanics: emitting
`TASK_CREATED`, writing initial `NEW_IDEA`, checking the current state,
validating the state machine edge, emitting any phase-transition policy
decision, projecting the `TASK_STATE_TRANSITION` event, writing `state.json`,
and emitting terminal lifecycle events such as `TASK_COMPLETED` and
`TASK_ABORTED`. Slash command Modules still own workflow intent: task
allocation, current-task selection, which prior states they allow, which target
state they enter, and command-specific work.

## Command runner

The Command runner Module owns local shell execution semantics: invoking
commands through the platform shell, timeout defaults, stdout/stderr capture,
exit-code normalization, and duration measurement. Step execution and
verification are Adapters over this Module: step execution adds scope checking
and execution-record shaping, while verification consumes command outcomes for
verification records.

## Eight artifacts

Each task produces these YAML artifacts at `.agent-os/tasks/<task-id>/`:

- `grill.yaml` — `GrillRecord` (assumptions, questions, risks, constraints, decision)
- `plan.yaml` — `PlanArtifact` (steps, expected files, commands, verification, rollback)
- `execution.yaml` — `ExecutionRecord` (per-step status, files changed, approvals)
- `verification.yaml` — `VerificationRecord` (commands run, pass/fail, next action)
- `review.yaml` — `ReviewRecord` (review outcome, scope drift, plan step count)
- `evaluation.yaml` — `EvaluationRecord` (task outcome, criteria satisfaction rate, process quality)
- `quick-task.yaml` — `QuickTaskRecord` (files changed, verification command, status)
- `knowledge.yaml` — `KnowledgeCaptureRecord` (proposed/approved/rejected captures)

Plus `SessionStatus` — computed by `/status`, never persisted.

## Events

All events share the constitution envelope `{event_id, event_type, session_id,
trace_id, span_id, system_id, timestamp, payload}`. CCP events add `task_id`
in the payload.

Constitution events: `BINDING`, `STATE_TRANSITION`, `HEARTBEAT`, `SKILL_LOAD`,
`SKILL_UNLOAD`, `PERMISSION_DENIED`, `VIOLATION`.

CCP events (22 total): see `src/ccp/ccp-events.ts`.

## Policy

The 4-tier permission ladder:

- **Tier 1 — AFK-safe.** Pass through silently.
- **Tier 2 — Approve once per session.** Cached by (tool, input-shape-pattern).
- **Tier 3 — Approve every time.** Always re-prompt.
- **Tier 4 — Block unless break-glass.** Deny by default.

Twelve tool classes: `READ_LOCAL`, `WRITE_LOCAL`, `EXECUTE_LOCAL`,
`READ_NETWORK`, `WRITE_NETWORK`, `MCP_READ`, `MCP_WRITE`, `BROWSER_READ`,
`BROWSER_WRITE`, `MEMORY_READ`, `MEMORY_WRITE`, `GOVERNANCE_MUTATION`.

## Memory scope

- `session` — temporary, lives within one Pi session
- `project` — `.agent-os` project memory, shared across sessions in this repo
- `global` — cross-project knowledge in your global brain DB

## Brain integration

CCP shells out to the `brain` CLI (Python) per the v3 Tier 1 transport.
Tagging convention on writes: `ccp:<task_id>`, `type:<type>`, `scope:<scope>`,
`project:<project_id>`. Confidence scale per `src/ccp/brain/client.ts`
`CONFIDENCE` map.

## Slash commands

- **`/init <project-id>`** — scaffolds a project's `.agent-os/` directory with bundled governance files and a rendered `project.yaml`. Replaces the v1.0.0-era `bootstrap-ccp.{sh,ps1}` scripts. Flags: `--upgrade` (refresh governance, preserve project.yaml), `--force` (overwrite), `--no-prompt` (CI mode), `--domain`/`--profile`/`--namespace`/`--critical-actions` (scripted values).

## File layout

```
.agent-os/
├── runtime/
│   ├── events.jsonl              truth log (append-only)
│   ├── session.json              atomic snapshot of session state
│   └── projection.db             SQLite projection (rebuilt from events.jsonl)
├── tasks/
│   ├── .next-id                  task counter
│   └── T-NNN/
│       ├── state.json            atomic snapshot of task state
│       ├── grill.yaml | plan.yaml | execution.yaml | verification.yaml
│       ├── review.yaml | evaluation.yaml | quick-task.yaml | knowledge.yaml
│       ├── pending-captures.yaml (only if brain is unavailable)
│       └── raw/<hash>.txt        compressed-output backing store
└── policy/
    └── permissions.yaml          (optional, only if NOT using project.yaml's policy fields)
```

The single source of truth for project config is `.agent-os/project.yaml`
(merge of manifest + policy per Q3 deviation).

## Working in this repo

- TypeScript-first; Plan 1 ported the Python runtime to TS.
- Tests use Vitest; mock UI through scripted fixtures.
- Don't add a Python user CLI back — it was deliberately dropped.
- Prefer `path.join` for cross-platform paths.
- Atomic writes use `<path>.tmp` + rename.
