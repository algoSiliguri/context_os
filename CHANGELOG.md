# Changelog

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
