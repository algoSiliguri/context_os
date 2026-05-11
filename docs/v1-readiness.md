# Agent_OS v1 Readiness

_Last updated: 2026-05-11. Strict — no wishful marking._

---

## Executive Verdict

v1 is **release-candidate quality** with four deferred items documented below.

All critical-path behaviors are implemented, tested, and TypeScript-clean. The main trust gaps from prior passes (ephemeral policy decisions, advisory-only scope checking, untested /flow, orphan memory candidates, missing install validation) are now closed.

Baseline: **395 tests, 0 failures, 0 TypeScript errors.** (80 test files, incl. lifecycle integration)

---

## v1 Readiness Checklist

| Item | Status | Notes |
|------|--------|-------|
| Real /run executor | **Done** | `makeShellStepExecutor` — stdout/stderr/exit_code/duration captured per command |
| Verified /verify | **Done** | Runs real shell verification commands via `execFileAsync` |
| Hard phase gates | **Done** | `requireTaskState` enforces all command transitions; throws on wrong state |
| PolicyDecisionRecord audit | **Done** | `POLICY_DECISION` events emitted for every gate allow/block/escalate/approve/reject |
| expected_files enforcement | **Done** | Git delta compared post-step; `extra_files_detected` → step fails |
| /flow tests | **Done** | Pause behavior, no-goal rejection, /continue dispatch tests |
| /flow resume | **Done** | `/continue` dispatches to correct next command from current state |
| Memory staging | **Done** | `stageCandidates` → `approveCandidate` / `rejectCandidate` — disk-durable |
| Memory orphan recovery | **Done** | `/memory [task-id]` resumes pending candidates; POLICY_DECISION emitted |
| Status/flight operator UI | **Done** | Status bar, `/status` shows pending count + recovery command, `/flight` shows POLICY_DECISION |
| Starter single-source onboarding | **Done** | `setup.sh` is single entrypoint |
| Install manifest | **Done** | Written by `setup.sh`; validated by `doctor` and `smoke-test.sh` |
| Doctor/smoke test | **Done** | Doctor checks manifest + brain DB; smoke-test validates manifest schema |
| knowledge-brain tests | **Done** | 91 passed, 0 skipped (fixed by `uv sync --extra dev`) |
| Docs match implementation | **Done** | This document; no unsupported claims |

---

## What Changed This Pass

### Phase 1 — PolicyDecisionRecord
- `buildPolicyDecisionEvent` added to `src/core/events.ts`
- `emitPolicyDecision` helper in `src/ccp/commands/shared/policy-decision-writer.ts`
- Wired into: `run.ts`, `verify.ts`, `plan.ts`, `review.ts`, `evaluate.ts`, `remember.ts` (gate allow/block)
- Wired into: `remember.ts` (memory candidate approve/reject)
- Wired into: `extension.ts` tool_call handler (allow/block/escalate/ask/approve/reject)
- Wired into: `extension.ts` `/run` checkpoint create/restore
- `POLICY_DECISION` added to renderer SHOW set — renders in `/flight` timeline
- Projector label: `[policy] ✓ allow /run (state_ok) src=command_handler`
- Tests: 4 tests in `policy-decision-writer.test.ts`; 2 added to `run.test.ts`

### Phase 2 — expected_files Enforcement
- `ScopeResult` type added to `step-executor.ts`
- `gitChangedFiles` helper snapshots git state pre/post step
- `classifyScope` classifies: `exact_match | subset_match | extra_files_detected | missing_expected_changes | no_changes | non_git_unverifiable`
- `extra_files_detected` → `status: 'failed'`, `failure.reason: 'scope_violation'`
- Non-git projects → `scope_result: 'non_git_unverifiable'` (explicit, not silent)
- Read-only declared files (`operation: 'read'`) excluded from declared scope check
- `ExecutedStep` TypeBox schema updated with scope fields
- Tests: 4 scope tests added to `step-executor.test.ts`

### Phase 3 — /continue + /flow Tests
- `/continue` command: reads current state, dispatches to correct next command
- Handles all states: SHARED_UNDERSTANDING → /plan, AWAITING_PLAN_APPROVAL/FAILED_RECOVERABLE → /run, VERIFYING → /verify, AWAITING_HUMAN_REVIEW → /review, EVALUATING → /evaluate
- PERSISTING_KNOWLEDGE, DONE: informational messages
- Unknown states: tells user to run /status
- Tests: /flow no-goal, /flow pause, /continue no-task, /continue DONE, /continue unknown-state, /continue dispatch

### Phase 4 — Orphan Memory Recovery
- `/memory [task-id]` command: lists pending candidates, approve/reject each
- Brain unavailable → keeps candidate pending (no silent discard)
- Idempotent: approve on already-approved candidate doesn't crash
- POLICY_DECISION emitted for each recovery approve/reject
- `/status` now shows exact recovery command: `run /memory T-001 to resume`
- Tests: orphan survivor test, idempotency, reject-after-approve

### Phase 6 — agent-os-starter Hardening
- Doctor checks `install-manifest.json`: presence + required fields
- `smoke-test.sh`: validates manifest JSON is parseable + has required fields
- Doctor failure message is actionable: `Run: bash setup.sh`

---

## Policy/Audit Flow

**Where created:**
- Phase gate (allow): `run.ts`, `verify.ts`, `plan.ts`, `review.ts`, `evaluate.ts`, `remember.ts` — on successful `requireTaskState`
- Phase gate (block): same files — on `requireTaskState` throw
- Tool call (all outcomes): `extension.ts` tool_call handler
- Memory approve/reject: `remember.ts`, `extension.ts` /memory handler
- Checkpoint create/restore: `extension.ts` /run handler

**Where consumed:**
- `/flight` timeline: `POLICY_DECISION` appears as `[policy] ✓/✗ <decision> <subject> (<reason_code>) src=<source>`
- Future: `PolicyDecisionRecord` artifact (v1.x) for per-task audit export

**Fields:** `decision_id`, `task_id`, `session_id`, `timestamp`, `phase`, `subject_type`, `subject_name`, `action_requested`, `decision`, `reason_code`, `reason`, `risk_tier`, `approved_by`, `source`, `memory_candidate_refs`

---

## Scope Enforcement

**How checked:** `makeShellStepExecutor` runs `git diff --name-only HEAD` + `git ls-files --others --exclude-standard` before and after step commands. Delta = new files in post that weren't in pre.

**Extra files:** `extra_files_detected` → step `status: 'failed'`, `failure.reason: 'scope_violation'`, `incidental_files` list populated. Operator sees violation in execution record.

**Non-git projects:** Returns `scope_result: 'non_git_unverifiable'` with explicit reason. Step still passes — operator is informed, not blocked.

**Read-only files:** `operation: 'read'` excluded from declared set. No false violations on read-only steps.

---

## Flow/Resume Behavior

**`/flow <goal>` pause points:**
1. After grill → confirm "proceed with /plan?"
2. After plan → if `planOutcome !== 'approved'`, pause with message
3. After plan approved → confirm "proceed with /run?"
4. After run → if `runOutcome !== 'verifying'`, restore checkpoint + pause
5. After verify → if `verifyResult !== 'pass'`, pause
6. After review → if FAIL/BLOCKED, pause
7. After evaluate → notify; never auto-runs /remember

**`/continue [task-id]` resume:**
- Reads `loadTaskState`; dispatches to correct next command
- Works for tasks started via /flow or manually
- DONE/TASK_COMPLETE: informs and stops
- Unknown states: tells user to check /status

---

## Memory Recovery

**Pending candidate path:** `stageCandidates` writes to `.agent-os/tasks/{id}/memory-candidates.yaml`. Survives process crash. `listPendingCandidates` reads on next session.

**Resume command:** `/memory [task-id]` — iterates pending, prompts approve/reject per candidate.

**Approve behavior:** Writes to brain, calls `approveCandidate` (updates YAML), emits POLICY_DECISION.

**Reject behavior:** Calls `rejectCandidate` (updates YAML), emits POLICY_DECISION.

**Idempotency:** `approveCandidate` on already-approved candidate does not throw — updates fields again. `brain_node_id` set by first approval is preserved.

**Brain unavailable:** Keep candidate pending, notify operator. No silent discard.

---

## UI/Operator Behavior

**On session start:** "Agent OS active. Run /doctor to check project setup."

**Status bar:** `{taskId} | {STATE}` — updates after every command.

**`/status`:** Shows `{taskId} · {STATE}\nnext: {next_action}\n{N} memory candidate(s) pending — run /memory {taskId} to resume`

**`/flight`:** Shows all lifecycle events including POLICY_DECISION lines.

**Entry point:** `/flow <goal>` is the guided path. `/continue` resumes in-progress tasks. Slash commands remain as escape hatches.

**No-UI mode:** All commands degrade to `ctx.ui.notify` text output. No UI-only paths.

---

## Starter/Onboarding

**Manifest:** Written by `setup.sh` at `.agent-os/install-manifest.json` with `installed_at`, `knowledge_brain_version`, `agent_os_extension`, `brain_db_path`, `node_version`, `uv_version`.

**Doctor behavior:** Checks manifest presence (soft_fail if missing) and field completeness (soft_fail if missing fields). Actionable message: `Run: bash setup.sh`.

**Smoke-test:** Checks manifest exists, is valid JSON, has required fields. Any failure exits 1 with `Run 'bash setup.sh' to fix failures.`

---

## Test Evidence

```
TypeScript: npx tsc --noEmit → 0 errors
Agent_OS:   npm test → 395 passed, 0 failures (80 test files)
  incl. tests/integration/lifecycle.test.ts (10 tests — real shell, real scope, real verify, real brain)
knowledge-brain: uv sync --extra dev && uv run pytest tests/ -v → 91 passed, 0 skipped
```

---

## Deferred — v1.x

These are not v1 blockers. Operator can recover from all failure paths without them.

| Item | Reason Deferred |
|------|-----------------|
| `PolicyDecisionRecord` artifact (per-task YAML export) | POLICY_DECISION events in `/flight` cover audit need for v1 |
| `/flow` full happy-path integration test (grill→evaluate) | Requires all sub-command fixtures; behavior covered by unit tests per command |
| MemoryCandidate orphan recovery CLI (outside Pi) | `/memory` command covers the Pi case; standalone CLI is v1.x |
| `expected_files` enforcement for large monorepos with `.gitignore` exceptions | Edge case; `non_git_unverifiable` covers the hard case |
| PolicyDecision rate-limiting / dedup | Not needed for correctness |
