# Changelog

## v1.6.0 — pending tag

Release-hardening cut for safe local development and normal-user lifecycle
operations. See [docs/release-notes-v1.6.0.md](docs/release-notes-v1.6.0.md).

### Added
- Isolated local developer smoke: `npm run dev:smoke`.
- Doctor provenance reporting for Pi, Agent_OS, project state, and
  knowledge-brain.
- agent-os-starter lifecycle wrappers for setup, doctor, update, uninstall, and
  guarded user/global smoke.
- Shared lifecycle install config and non-mutating release check.

### Changed
- Starter lifecycle commands now read install targets from one config instead of
  hardcoded stale refs.
- Update and uninstall support dry-run safety; uninstall preserves project data
  by default.

## v1.4.0 — 2026-05-11

### Added
- **Workflow-pack runtime** — manifest-driven phase registry for governed orchestration.
  - `src/core/workflow-pack-loader.ts` — loads and validates `workflow-pack.yaml` manifests.
  - `src/core/phase-registry.ts` — immutable registry of phases and validators; predecessor gate checks.
  - `workflow-pack.yaml` bundled at `src/ccp/commands/init/packs/copilot-workflow/` — copilot-workflow is the first workflow pack (9 phases: setup-workflow → diagnose → grill → write-plan → quick-task → execute-plan → verify → review → evaluate → remember).
  - `WORKFLOW_PACK_LOADED`, `PHASE_STARTED`, `PHASE_COMPLETED`, `PHASE_FAILED`, `PHASE_BLOCKED_PREDECESSOR` events emitted with every phase execution.

- **Advisory validators** — 4 built-in validators in `src/core/validator-runner.ts`, wired into extension.ts post-phase.
  - `validate-artifact` — envelope fields present and well-formed (artifact_type, task_id T-NNN pattern, schema_version, created_at).
  - `validate-plan-scope` — plan has non-empty `scope.in` and at least one step.
  - `validate-criteria-coverage` — if grill defined success_criteria, verification result must be pass/pass_with_degradation.
  - `validate-evaluation-gate` — evaluation record has valid `criteria_satisfaction_rate` (0–1) and `task_outcome`; PASS/0% consistency check.
  - `VALIDATOR_STARTED`, `VALIDATOR_PASSED`, `VALIDATOR_FAILED` events emitted per validator run.

- **4 new Pi slash commands** (13 total):
  - `/diagnose` — structured bug analysis (6 prompts → `diagnosis.yaml`). State: `NEW_IDEA → DIAGNOSING → SHARED_UNDERSTANDING`.
  - `/quick-task` — fast escape-hatch for trivial tasks with escalation check (`quick-task.yaml`). State: `NEW_IDEA → QUICK_TASKING → AWAITING_HUMAN_REVIEW`.
  - `/review` — human review of completed work (`review.yaml`). State: `AWAITING_HUMAN_REVIEW → EVALUATING` (PASS) or `VERIFYING` (FAIL/BLOCKED).
  - `/evaluate` — score task outcome; computes `criteria_satisfaction_rate` (`evaluation.yaml`). State: `EVALUATING → PERSISTING_KNOWLEDGE` (PASS) or `FAILED_RECOVERABLE` (FAIL).

- **3 new task states** (17 total): `DIAGNOSING`, `QUICK_TASKING`, `EVALUATING`.
- **4 new artifact types**: `diagnosis`, `quick-task`, `review`, `evaluation` (written via `writeArtifactRaw`; TypeBox schemas deferred to v1.5.0).
- **8 new CCP events**: `DIAGNOSE_STARTED/COMPLETED`, `QUICK_TASK_STARTED/COMPLETED`, `REVIEW_STARTED/COMPLETED`, `EVALUATE_STARTED/COMPLETED`.

### Fixed
- `/plan` after `/diagnose` no longer throws ENOENT — falls back to `diagnosis.yaml:bug_summary` when `grill.yaml` is absent.

### Architecture
- Implemented: workflow-pack runtime, phase registry, advisory validators, 4 new commands, extended state machine.
- Partially implemented: TypeBox schemas for new artifact types (deferred — using raw YAML read/write).
- Deferred: external (file-based) validator plugins; `/flight` phase-state display; TypeBox schemas for diagnosis/quick-task/review/evaluation artifacts.
- Not implemented: Copilot/Codex/Claude Code/MCP runtime adapters (Pi only for v1).

### Backwards compatibility
- v1.3.0-era projects work unchanged. New commands only activate when a workflow pack is loaded. All 9 original commands (`/init`, `/doctor`, `/grill`, `/plan`, `/run`, `/verify`, `/remember`, `/status`, `/flight`) behave identically.

## v1.3.0 — 2026-05-10

### Added
- **Local Black Box Observability** — session-scoped flight recorder for every task.
  - Every command writes events to `.agent-os/runtime/sessions/{session_id}/events.jsonl`.
  - Dashboard projected live to `.agent-os/runtime/sessions/{session_id}/dashboard.json`.
  - `/flight` slash command — timestamped timeline, health classification, writes `report.md`.
  - `/status` now shows Black Box health (HEALTHY / STUCK / LOOPING / FAILED / DONE).
  - Brain memory operations (query, write) captured as events with latency and hash.
  - Step boundaries (STEP_STARTED / STEP_COMPLETED / STEP_FAILED) captured during `/run`.
  - Heartbeat emitted every 30s — prevents false STUCK classification during long AI turns.
  - Brain query dedup signal: same query repeated ≥3 times increments `repeated_queries`.
  - Loop detection: same state transition ≥3 times sets `loop_detected=true`.
  - Session continuity: task's `state.json` stores `session_id` — all commands for a task share one session, producing a complete GRILL→PLAN→RUN→VERIFY→REMEMBER arc in one `/flight` view.
  - Report written to `report.md` in session directory after each `/flight` call.

### Changed
- `/status` extended with optional `sessionId` and `render` parameters; backward compatible.
- `task.json` (state.json) now includes `session_id` field (written on first `/grill`).

### Backwards compatibility
- v1.2.0-era projects work unchanged. Tasks created before v1.3.0 lack `session_id` in `state.json`; those tasks fall back to a fresh UUID per command (split sessions, pre-existing behavior).

## v1.2.0 — 2026-05-08

### Fixed
- Extension now works with Pi v0.74.0 (`@earendil-works/pi-coding-agent`). Previous versions were written against an older, incompatible Pi API and would silently fail to load.
- `Type.Composite` → `Type.Intersect` in all schema files (Pi bundles typebox v1.1.38 which removed `Type.Composite`).

### Added
- Tier-based tool approval policy on every Pi tool call:
  - Tier 1 (`read`, `grep`, `find`, `ls`) — silent pass.
  - Tier 2 (`edit`, `write`) — confirm once per session, then cached.
  - Tier 3 (`bash`) — confirm on every call.
  - Tier 4 (`sudo`, `.env`, `.ssh` patterns) — hard block.
  - Unknown tools (MCP) — ask once.
- `/grill`, `/plan`, `/run`, `/verify`, `/remember` commands wired to Pi v0.74.0 API.
- `/init` auto-detects project ID from folder name when no argument given.
- `/init` on an already-initialized project auto-upgrades governance files without overwriting `project.yaml`.
- Brain DB stored at `data_store/knowledge.db` inside the project — no `BRAIN_DB_PATH` env var needed.

### Changed
- Pi package name corrected to `@earendil-works/pi-coding-agent` (was `@mariozechner/pi-coding-agent`).
- README simplified for non-developers.

## v1.1.0 — 2026-05-07

### Added
- `/init <project-id>` slash command that scaffolds a greenfield project (governance files, runtime dirs, manifest). Replaces the per-repo `bootstrap-ccp.{sh,ps1}` scripts.
- Bundled governance: constitution + 3 schemas + contract index now ship inside the extension package; no runtime HTTP fetch.
- README sections covering Pi's full provider menu (Anthropic, OpenAI, Google, custom via `~/.pi/agent/models.json`).

### Changed
- `project.yaml.template` moved from `trading-playground/.agent-os/` into the extension at `src/ccp/commands/init/project.yaml.template`.

### Backwards compatibility
- v1.0.0-era projects keep working unchanged. `/init --upgrade` re-copies bundled governance (bytes are byte-identical to v1.0.0; verified by CI). Existing `project.yaml` is never touched by `--upgrade`.

## v1.0.0 — 2026-05-05
Initial release. See `docs/demo/section-16-walkthrough.md` for the demo path.
