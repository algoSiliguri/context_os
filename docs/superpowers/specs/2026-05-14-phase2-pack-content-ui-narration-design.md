# Phase 2 Design — engineering-core pack content + snapshot UI + full narrator audit

**Date:** 2026-05-14
**Status:** Design, awaiting plan + implementation
**Branch:** `feature/phase1-pack-seam-narration` (continues PR #26)
**Predecessor:** `docs/2026-05-14-skill-pack-architecture-audit.md` §10 Phase 2
**Predecessor plan:** `docs/superpowers/plans/2026-05-14-phase1-pack-seam-narration.md`

---

## 1. Goal

Complete Phase 2 of the skill-pack architecture audit. Three tracks shipping together as additional commits on PR #26:

- **Track A:** Author the bundled `engineering-core` workflow pack — markdown prompt content for the 6 diagnose sub-phases, grill intro, and a legacy-safe question pack.
- **Track B:** Upgrade `/status`, `/flight`, `/doctor`, `/trace` to medium-density ANSI snapshots showing pack state, phase progress, validator summary, memory pending, and recent narration.
- **Track C:** Wire the narrator (added in Phase 1) into the remaining ~35 `ui.notify` call sites in `src/pi/extension.ts`, grouped by tag. Add pack-selection UX to `/init` when multiple bundled packs are available. Publish `docs/narration-tags.md`.

End state: every system action is visible in the terminal as a tagged narration line, `/status` and friends show dense pack/phase/validator state, and a substantive engineering-discipline pack (`engineering-core`) is bundled and installable.

---

## 2. Constraints (from the audit, unchanged)

- Pi is the only v1 runtime target.
- No persistent TUI region — narration is sequential `ui.notify` lines.
- No autonomous hooks.
- No validator path execution (validators remain core code; packs declare which built-in IDs run).
- No Matt Pocock skill content imported directly — principles only.
- No external pack distribution (packs stay bundled inside Agent_OS).
- No pack merging or multi-pack runtime — first valid pack still wins.
- No new commands.
- No pack-driven artifact schemas beyond additive fields (Phase 1 already covered DiagnosisRecord additions).

---

## 3. Architecture overview

Three tracks land sequentially on the existing PR #26 branch (`feature/phase1-pack-seam-narration`). Sequencing matters because Track C touches `extension.ts` broadly and would conflict with Track B's renderer wiring if done first.

```
Track A — engineering-core pack content
    │
    ▼ ships first (small, contained, no extension.ts edits)
Track B — Snapshot UI upgrades (medium density)
    │  uses pack state from Track A in /status output
    ▼ ships second
Track C — Pack selection UX + remaining narrator audit
    │  touches extension.ts broadly — do last
    ▼ ships third
```

Estimated commits: ~20–25 on top of the 13 in PR #26.

---

## 4. Track A — engineering-core pack content

### 4.1 File layout

```
src/ccp/commands/init/packs/engineering-core/
├── workflow-pack.yaml
├── README.md
└── prompts/
    ├── diagnose/
    │   ├── 01-build-feedback-loop.md
    │   ├── 02-reproduce.md
    │   ├── 03-falsifiable-hypothesis.md
    │   ├── 04-instrument.md
    │   ├── 05-fix-at-seam.md
    │   └── 06-cleanup.md
    └── grill/
        ├── intro.md
        └── legacy-safe.md
```

### 4.2 Pack manifest (`workflow-pack.yaml`)

- `workflow_pack_id: engineering-core`
- `version: "1.0.0"`
- `schema_version: "1.0.0"`
- `runtime_target: pi`
- `min_agent_os_version: "1.5.0"` (relies on the Phase 1 prompts seam)
- Same 10-phase DAG as `agent-os-core` (setup-workflow → diagnose → grill → write-plan → quick-task → execute-plan → verify → review → evaluate → remember).
- `grill: { question_profile: doc_grounded, max_questions: 8 }`
- `plan: { verification_profile: detected }`
- `validators:` lists the 4 built-in IDs from `agent-os-core` plus `validate-falsifiable-hypothesis` and `validate-no-stray-debug-tags`.
- `prompts:` block declares all 8 markdown files.
  - `prompts.diagnose.phases[]` lists 6 entries with `id`, `prompt`, `exit_condition`, and `validator` (only set for phases 3 and 6).
  - `prompts.grill.intro` points at `prompts/grill/intro.md`.
  - `prompts.grill.question_packs[]` lists `prompts/grill/legacy-safe.md`.

### 4.3 Prompt content (tone: pedagogical — methodology context + concrete action)

Each prompt body is 100–400 words. Pattern: 1–2 sentences of methodology, then the concrete question/options.

**`01-build-feedback-loop.md`** — explains that the feedback loop is the most important thing in diagnosis; without a reproducible signal every change is a guess. Asks user to pick from a ranked menu (failing test → curl → CLI snapshot → Playwright → trace replay → throwaway harness → fuzz → bisect harness → HITL bash). Output captured to `feedback_loop` field.

**`02-reproduce.md`** — explains that a bug you can't reproduce is a bug you can't fix; reproduction must be reliable and minimal. Asks for the minimal command/steps and a yes/no confirmation that it reliably produces the bug. Output captured to the `reproduce` sub-phase's `user_note`, then becomes the `minimal_case` and `reported_behavior` in the final artifact.

**`03-falsifiable-hypothesis.md`** — explains falsifiability: a hypothesis without an `if … then …` clause is a guess. Asks user to state ≥1 hypothesis in `"if X then Y"` form. Will be validated by `validate-falsifiable-hypothesis` on phase exit.

**`04-instrument.md`** — explains tagged-log discipline: every debug log in a session carries a unique prefix so cleanup is a grep, not a memory test. Asks user to pick a unique tag (recommended format: `[DEBUG-<4hex>]`). Output captured to `instrumentation_tag`.

**`05-fix-at-seam.md`** — explains the seam principle: a fix at the wrong seam is a future bug. The honest output when no correct seam exists is "no-seam" — that's the finding. Asks user to describe the fix landing spot, OR type `no-seam` to record the gap.

**`06-cleanup.md`** — explains why stray debug tags matter: noise pollution + confidentiality risk. Asks user to confirm cleanup is done. Will be validated by `validate-no-stray-debug-tags` against `instrumentation_tag`.

**`prompts/grill/intro.md`** — sets methodology for the grill phase: one question at a time, recommended answer per question, codebase cross-reference, glossary updates inline. ~150 words. Read once at the start of `/grill`.

**`prompts/grill/legacy-safe.md`** — optional question pack for unknown-test-stack repos. Adds questions about test seam ("Where would a regression test land?"), blast radius ("Which downstream components could break?"), and rollback path ("Can this be reverted in <5 min?") before the standard functional questions. Format: `##` heading per question so `PackQuestionGenerator` can parse it.

### 4.4 Pack README

`README.md` explains what `engineering-core` adds on top of `agent-os-core`: doc-grounded grill + phased `/diagnose` + two extra validators + legacy-safe question pack. When to install which (rule of thumb: `engineering-core` for active engineering work; `agent-os-core` if you only want the governance shell).

---

## 5. Track B — Snapshot UI upgrades (medium density, no box chars)

### 5.1 Layout reference

`/status` — current task snapshot, with the new sections:

```
● HEALTHY   T-001  GRILLING

  Pack:        engineering-core@1.0.0 ✓ current
  Phase:       4/8  [████░░░░]  (currently: grill)
  Validators:  ✓ 4   ✗ 0   ⚠ 0
  Memory:      0 candidates pending
  Last event:  3m ago

  Recent:
  15:23  [pack] engineering-core v1.0.0 loaded
  15:24  [phase] NEW_IDEA → GRILLING
  15:25  [validator] validate-artifact passed

  Next: answer questions or type "done"
```

`/flight` — same layout, `Recent` scoped to current task lifetime (up to 20 events), no `Next` line.

`/doctor` — health check:

```
● Agent OS doctor

  Constitution:    ✓ present
  Project config:  ✓ valid (project.yaml)
  Packs:
    ✓ engineering-core@1.0.0 current
    ✓ agent-os-core@1.2.0 current (inactive)
  Verification:    ✓ pytest detected (pyproject.toml)

  Status: pass
```

Stale-pack variant adds:
```
    ⚠ engineering-core@1.0.0 stale (bundled v1.1.0)

  Status: soft_fail
  Hint:   run /init --upgrade --force
```

`/trace` — full timeline:

```
──────────────────────────────────────────────────────────
  Session 7b3c92a4  ● HEALTHY   T-001  COMPLETED
──────────────────────────────────────────────────────────
  … 12 earlier events
  15:23  [pack] engineering-core v1.0.0 loaded
  15:24  task created: Add dark mode toggle
  15:24  [phase] NEW_IDEA → GRILLING
  ...
──────────────────────────────────────────────────────────
  signals: loop=false  failures=0  repeated_q=0  last=2m ago
```

### 5.2 New renderer helpers (`src/core/renderer.ts`)

| Helper | Signature | Behavior |
|---|---|---|
| `renderPackBadge(state, packId, version, bundledVersion?)` | `(state: 'current'\|'stale'\|'newer'\|'unknown'\|'modified-locally', id: string, v: string, bundledV?: string) => string` | Renders the badge string. Stale/newer variants include the bundled version reference. |
| `renderProgressBar(current, total, width)` | `(current: number, total: number, width?: number) => string` | Returns `4/8  [████░░░░]`. Default `width=8`. Clamps `current` to `[0, total]`. |
| `renderValidatorSummary(results)` | `(results: ValidatorOutcome[]) => string` | Aggregates ✓/✗/⚠ counts across validator runs. |
| `renderMemoryState(pending)` | `(pending: number) => string` | `0 candidates pending` or `N candidates pending approval`. |

All helpers respect the existing `USE_ANSI` flag (`renderer.ts:15-18`). ASCII fallback table:

| ANSI glyph | ASCII fallback |
|---|---|
| `●` | `*` |
| `✓` | `[ok]` |
| `✗` | `[x]` |
| `⚠` | `[!]` |
| `█` | `#` |
| `░` | `-` |

Detection: when `process.stdout.isTTY === false` OR `process.env.NO_COLOR` is set OR `process.env.AGENT_OS_ASCII === '1'`.

### 5.3 SessionDashboard projection extensions (`src/core/projector.ts`)

Add four optional fields to `SessionDashboard`:

```typescript
interface SessionDashboard {
  // ... existing fields ...
  active_pack?: { id: string; version: string; state: PackVersionState };
  phase_progress?: { current: number; total: number; name: string };
  validator_outcomes?: { passed: number; failed: number; warned: number };
  memory_pending?: number;
}
```

Additive optional fields — backwards compatible. Populated by the projector from new event types added in Track C narration (`WorkflowPackLoadedEvent`, `ValidatorFinishedEvent`, etc.) which already exist; the projection just needs to read them.

### 5.4 Width handling

All snapshot helpers accept an optional explicit `width` parameter that defaults to terminal width detected via `process.stdout.columns ?? 70`. Snapshot tests pass `width=70` explicitly so the golden bytes don't drift between machines.

---

## 6. Track C — Pack-selection UX + full narrator audit

### 6.1 Pack selection in `/init`

When `loadBundledPacks()` returns >1 pack and the run is interactive (TTY available), prompt:

```
Two workflow packs available:
  1. agent-os-core    (governance baseline)
  2. engineering-core (governance + diagnose/grill discipline)
Pick one [1/2]:
```

Selection stored in `.agent-os/install-manifest.json` so `/doctor` and `/init --upgrade --force` can re-use the choice.

**Fallback order when no interactive prompt is possible:**

1. If `--pack <id>` CLI flag is set, use that (skip prompt).
2. If only one pack is bundled, use it (no prompt).
3. If `process.stdout.isTTY === false`, default to `agent-os-core` (the safe baseline) and emit a `[pack]` narration line explaining the choice.
4. Otherwise prompt.

### 6.2 Narrator audit by tag

Wire `narrate(tag, message)` into every remaining `ui.notify` site in `src/pi/extension.ts`, grouped into nine focused commits (one per tag).

| Tag | When | Production sites |
|---|---|---|
| `[phase]` | Every `transitionTaskLifecycle` call result | ~12 sites across all command handlers |
| `[doc]` | `detectDocs` results consumed | 2-3 sites (buildGrillGenerator, plan drafter) |
| `[step]` | `/run` step start/complete/fail | ~5 sites in run handler |
| `[memory]` | Capture proposed/approved/declined | ~4 sites in remember handler |
| `[plan]` | Plan drafter selection, detected test commands | ~3 sites in plan handler |
| `[verify]` | Verification command start/result | ~3 sites in verify handler |
| `[review]` | Human-review boundaries | ~2 sites |
| `[evaluate]` | Evaluation outcome | ~2 sites |
| `[doctor]` | Each doctor check | ~5 sites |

Approximate total: ~35-40 wiring sites, in 9 commits.

### 6.3 New doc: `docs/narration-tags.md`

One section per tag listing the example output and the `file:line` location that emits it. Becomes the canonical reference. CI grep-based check (in a follow-up; not in this PR scope) ensures every emitted tag is documented.

---

## 7. Test strategy

Total new tests: ~30.

| Track | Test file(s) | Coverage |
|---|---|---|
| **A** | `tests/unit/engineering-core-pack.test.ts` | (1) Pack loads via `loadWorkflowPacks` on the bundled source root. (2) All 8 prompt files resolve to non-empty content. (3) Phase manifest declares 10 phases. (4) Validators include `validate-falsifiable-hypothesis` + `validate-no-stray-debug-tags`. (5) Each diagnose prompt file is < 10 KB. |
| **B** | `tests/unit/renderer-helpers.test.ts` | (1) `renderPackBadge` for each state — ANSI + ASCII paths. (2) `renderProgressBar` clamping + width math. (3) `renderValidatorSummary` aggregation. (4) `renderMemoryState` plural/singular phrasing. (5) ASCII fallback when `NO_COLOR` set. |
| **B** | `tests/unit/snapshot-status.test.ts` | (1) Fresh task — `/status` snapshot. (2) Mid-grilling (phase 4/8) — `/status` shows progress. (3) Stale pack — `/status` shows stale badge. (4) `/doctor` — fresh install. (5) `/doctor` — stale pack with recovery hint. Golden ANSI strings committed; CI fails on unexpected diff. |
| **C** | `tests/unit/narrator-coverage.test.ts` | For each of the 15 commands, run with a minimal fixture and assert ≥1 narration line is emitted at the entry boundary. |
| **C** | `tests/integration/pack-selection-init.test.ts` | (1) Two bundled packs + TTY → prompt fires. (2) Two bundled packs + `--pack engineering-core` flag → no prompt, that pack installed. (3) One bundled pack → no prompt. (4) No TTY, no flag → defaults to `agent-os-core` + emits `[pack]` line. |

**Snapshot test brittleness mitigation:** all snapshot tests pass `width=70` explicitly to the renderer; ANSI escape codes are stable; glyphs documented in this spec; CI uses the same Node version as local dev (per `.nvmrc` if present).

---

## 8. Sequencing and commit shape

Approximate commit topology on `feature/phase1-pack-seam-narration` after Phase 2:

```
Phase 1 (already pushed)
  ├── docs, narrator, pack-prompts seam, validators, phased diagnose, narrator wiring, fixes, version bump
Phase 2 commits (new in this design)
  Track A (4-5 commits)
  ├── feat(packs): add engineering-core workflow-pack.yaml + README
  ├── feat(packs): author diagnose sub-phase prompts (01-06)
  ├── feat(packs): author grill intro + legacy-safe pack
  ├── test(packs): engineering-core pack-loads + prompts-resolve
  Track B (6-8 commits)
  ├── feat(core/renderer): add renderPackBadge helper
  ├── feat(core/renderer): add renderProgressBar helper
  ├── feat(core/renderer): add renderValidatorSummary + renderMemoryState
  ├── feat(core/projector): extend SessionDashboard with pack/phase/validator/memory
  ├── feat(status): upgrade /status to medium-density layout
  ├── feat(doctor): upgrade /doctor output
  ├── feat(trace): upgrade /trace output
  ├── test(renderer): unit + snapshot tests
  Track C (10-12 commits)
  ├── feat(init): pack-selection prompt when multiple bundled packs
  ├── feat(pi): narrate [phase] transitions
  ├── feat(pi): narrate [doc] detection
  ├── feat(pi): narrate [step] start/complete/fail
  ├── feat(pi): narrate [memory] events
  ├── feat(pi): narrate [plan] events
  ├── feat(pi): narrate [verify] events
  ├── feat(pi): narrate [review] events
  ├── feat(pi): narrate [evaluate] events
  ├── feat(pi): narrate [doctor] events
  ├── docs: add narration-tags.md
  ├── test(narrator-coverage): every command emits ≥1 narration line
```

Final commit: version bump 1.5.0 → 1.6.0 (matching the Phase-1 pattern).

---

## 9. Risks

1. **ANSI snapshot brittleness across terminals.** Mitigated by `width=70` snapshots and stable ANSI codes; flagged in CI as a known maintenance cost.
2. **`extension.ts` growth.** After Track C the file will pass 65 KB. Extracting per-command handlers is out of scope here; flagged for Phase 3.
3. **`/init` pack-selection prompt breaks non-interactive scripts.** Mitigated by the `--pack <id>` flag and TTY-detection fallback.
4. **Snapshot golden files drift.** Mitigated by scoping snapshots to final-state outputs only; sequence-based tests don't pin strings.
5. **Pre-existing Windows test failures** (`doc-detector`, `test-command-detector`, `binding`, `constitution`, 3 integration files) are still on `main`. Not regressions; not blockers; flagged in PR body.

---

## 10. Explicitly out of scope (deferred to Phase 3 or later)

- Persistent TUI region (no Pi primitive; deferred indefinitely under v1.x Pi constraint).
- Web dashboard / VS Code webview.
- External pack distribution (`pi pack install github:owner/repo`).
- TDD pack (`tdd-pack`). Decision deferred until `engineering-core` dogfood evidence.
- Architecture-health pack. Same.
- ADR primitive in core. Same.
- Issue-tracker abstraction for `to-prd` / `to-issues` / `triage`. Same.
- Extracting per-command handlers out of `extension.ts`. Flagged for Phase 3.
- `defaultPlanDrafter` `npm test` hardcoding fix. Documented limitation #5; still intentional.

---

## 11. Acceptance criteria

For the PR to merge after Phase 2 lands:

- [ ] `engineering-core` pack loads cleanly via `loadWorkflowPacks` and `/init` (or `/init --pack engineering-core`) installs it.
- [ ] `/diagnose` under `engineering-core` runs all 6 sub-phases end-to-end producing a `DiagnosisRecord` with `phases`, `hypotheses`, `feedback_loop`, `instrumentation_tag` populated.
- [ ] `validate-falsifiable-hypothesis` and `validate-no-stray-debug-tags` actually run during the relevant sub-phases (no longer no-op as in pre-fix Phase 1).
- [ ] `/status`, `/flight`, `/doctor`, `/trace` produce medium-density output with pack badges, phase progress, validator summary, memory pending.
- [ ] `NO_COLOR=1 /status` falls back to ASCII glyphs cleanly.
- [ ] Every command (`/grill /plan /run /verify /review /evaluate /diagnose /quick-task /remember /doctor`) emits ≥1 tagged narration line.
- [ ] `docs/narration-tags.md` lists every emitted tag with a file:line citation.
- [ ] All Phase-1 backwards-compat tests still pass.
- [ ] `agent-os-core` (no `prompts:`) still installs and runs unchanged when chosen via the prompt or flag.
- [ ] `npx tsc --noEmit` 0 errors.
- [ ] Pre-existing Windows test failures unchanged in count and identity (no new regressions).

---

## 12. Open questions

None. All design choices locked during brainstorm:

- Scope: all three tracks in one PR.
- Snapshot density: medium (sectioned, no box chars).
- Prompt tone: pedagogical (methodology + concrete action).
- Pack selection UX: interactive prompt during `/init` (with `--pack` flag escape hatch).
