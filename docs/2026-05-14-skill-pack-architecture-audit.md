# Skill / Workflow-Pack Architecture Audit

**Date:** 2026-05-14
**Status:** Recommendation, awaiting acceptance
**Scope:** Agent_OS v1.x — control plane, workflow-pack seam, first-party pack strategy
**Constraint context:** Pi-only runtime; Agent_OS is the control plane, not the memory backend; knowledge-brain is memory only; agent-os-starter is onboarding; office_github_copilot_workflow is not v1 runtime authority; stable, boring runtime beats clever workflow magic.

---

## 1. Executive verdict

**Original pain point status: PARTIALLY SOLVED.**

The lifecycle engine is real and mature; the workflow experience has improved meaningfully along `/grill` and `/plan` (when the bundled pack loads); but **`agent-os-core` is a config-over-core manifest, not a real skill pack**, and the original "feels skeletal" complaint still describes `/run`, `/verify`, `/review`, `/evaluate`, and especially `/diagnose`.

**Should curated skills live in core, in packs, or hybrid?**

**Hybrid (Option D).** Core owns universal primitives (already does); packs should own engineering behavior. But **the current pack seam is too shallow to carry behavior** — it only toggles hardcoded core paths. The honest position is "the seam is the right shape but not yet the right depth."

**Decision:** **First deepen one seam, then ship one first-party pack** (`engineering-core`), bundled inside Agent_OS (not as an external repo). No external-pack distribution in v1.x. **Additionally, upgrade core UI** with structured auto-narration and richer one-shot snapshots so that all steps the system takes are visible in the terminal — UI remains core-owned, but core UI gets denser.

- **Biggest architectural risk:** confusing "packs exist" with "skills are solved." A pack that only toggles hardcoded behavior is useful but is not yet a general skill system. Shipping `engineering-core` without first deepening the seam would produce a near-identical clone of `agent-os-core` and erode the credibility of the pack abstraction.
- **Biggest product opportunity:** `/diagnose`. It is currently the weakest command in core (a fixed prompt sequence) and the most legacy-codebase-friendly skill in the external prior art (Matt Pocock's `diagnose` skill). Replacing it with a pack-controllable phased workflow is the highest-leverage move.
- **UI scope (added 2026-05-14):** Pi's extension surface gives only `confirm`/`input`/`select`/`notify`/`log` — no persistent TUI region. The chosen path is therefore (a) **structured auto-narration**: every phase entry, validator run, pack load, doc detection, and decision emits a tagged `ui.notify` line so the user reads the system's actions as a scrolling narrative; and (b) **richer one-shot snapshots**: `/status`, `/flight`, `/doctor`, `/trace` upgraded with dense ANSI rendering of pack state, validator outcomes, phased progress, and concrete next-action hints. A separate persistent-TUI host (e.g., `ink`/`blessed` sibling binary) is explicitly deferred — Pi-only v1 runtime.

---

## 2. Verification of current claims

Source verification rerun only where this audit found doubt. `npm test` and `npx tsc --noEmit` were not rerun — the previous release-readiness pass verified them and this audit found no code changes invalidating that.

| Claim | Verified? | Evidence |
|---|---|---|
| BUG-01 fixed (unknown repo avoids fake `npm test`) | **YES (in practice)**, but with caveat | `src/core/test-command-detector.ts:28` rejects the `echo "Error: no test specified" && exit 1` placeholder. With pack loaded, `PackPlanDrafter` calls `detectTestCommands()` → `[]` for unknown repos. **Caveat: `defaultPlanDrafter` at `src/ccp/commands/shared/plan-drafter.ts:39,41` literally still says `command: 'npm test'` — only unreachable when a valid pack loads.** Documented limitation #5. |
| Phase 4A implemented (`/doctor` shows pack version) | YES | `src/core/doctor.ts:42-75` `resolvePackVersionDetail` compares installed vs bundled via `compareSemver`; reports `stale` / `current` / `newer` / `no-bundled` / `unknown`. |
| 491 tests passing | Cited from prior pass | Not rerun. No source changes detected that would invalidate. |
| TypeScript 0 errors | Cited from prior pass | Not rerun. No source changes detected that would invalidate. |
| `/init --upgrade --force` recovery works | YES | `src/ccp/commands/init/pack-installer.ts` overwrites existing pack manifest when `force=true`; prior dogfood confirmed stale v1.0.0 upgrades to v1.2.0. |
| Unknown repos avoid fake `npm test` | YES (caveated) | See BUG-01 row. The detector returns `[]` for repos without recognizable test stacks. The default-drafter fallback still produces `npm test` if the pack fails to load — currently unreachable in supported flows. |
| Pack seam exists in core, not only extension | YES | `src/core/workflow-pack-loader.ts`, `pack-plan-drafter.ts`, `pack-question-generator.ts`, `phase-registry.ts`, `doctor.ts:resolvePackVersionDetail`, `semver.ts` all live in `src/core/`. `src/pi/extension.ts:196-268` wires it. Seam is real, but **shallow — see §4 for depth assessment.** |

---

## 3. Current workflow reality

**What in Agent_OS is real:**
- The governed lifecycle (states, predecessors, approval gates, validators-on-phase-completion).
- Typed artifact envelopes (`src/ccp/artifacts/*`): grill-record, plan-artifact, execution-record, verification-record, review-record, evaluation-record, diagnosis-record, quick-task-record, knowledge-capture-record. All have schemas; envelope validation is enforced.
- Policy tier resolution (`src/ccp/policy/`): read=1, write=2, bash=3, dangerous=4. Phase-aware escalation outside EXECUTING. Overrides can tighten but not loosen. This is real, working, and core-owned.
- Memory routing (`src/core/memory-router.ts`, `src/ccp/commands/remember.ts`): every candidate is human-gated; nothing self-writes. Brain database paths configurable via manifest, not pack.
- Pack loader (`src/core/workflow-pack-loader.ts`): parses `workflow-pack.yaml`, validates manifest, sorts results, picks first valid, emits `WorkflowPackLoadedEvent`. Never throws — pack load failure becomes a notification, not a crash.
- Doctor checks: constitution presence (hard fail), project.yaml validity (hard fail), pack version staleness (soft fail), verification command availability.
- `PackQuestionGenerator` (`src/core/pack-question-generator.ts`) with doc-grounded sequence + max-question cap (hard cap 12).
- `PackPlanDrafter` (`src/core/pack-plan-drafter.ts`) with `detectTestCommands` integration.
- `test-command-detector` (`src/core/test-command-detector.ts`): Cargo, Go, Maven, Gradle, pytest (pyproject + pytest.ini), npm script (with placeholder rejection), Make.
- `doc-detector` (`src/core/doc-detector.ts`): bounded, deterministic scan of README, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, `.agent-os/context.md`, and `docs/**` (max 15 files, 256KB total, 50KB/file).

**What is still skeletal:**
- `defaultPlanDrafter` (`src/ccp/commands/shared/plan-drafter.ts:34-62`): still produces `commands: []` (honest — manual implementation is acceptable) AND hardcodes `npm test` (NOT honest when wrong — masked by pack-load success).
- `defaultQuestionGenerator` (`src/ccp/commands/shared/question-generator.ts:18-76`): fixed 7-question sequence, no doc awareness, no pack input.
- `/diagnose` (`src/ccp/commands/diagnose.ts`): fixed prompt sequence, no pack control, no phased loop.
- `/review` and `/evaluate`: fixed prompt sequences, no pack control.
- `/run` step execution: pack cannot inject step content, only set verification profile.

**What is too hardcoded in core:**
- Command set (15 commands registered in `src/pi/extension.ts:363-1320` via `pi.registerCommand`). Packs cannot add or rename commands.
- Artifact schemas (`src/ccp/artifacts/`). Closed/strict TypeScript interfaces. Packs cannot extend or override.
- Built-in validators (`src/core/validator-runner.ts:169-177`): only `validate-artifact`, `validate-plan-scope`, `validate-criteria-coverage`, `validate-evaluation-gate`. Unknown validator IDs are silently skipped (line 217). Pack-declared validators are name-only references to built-ins.
- Policy tier table and dangerous-pattern matching.
- Status / flight rendering (`src/ccp/commands/status.ts`, `src/core/renderer.ts`, `projector.ts`).
- Memory capture proposer (`src/ccp/commands/remember.ts:49`): `defaultCaptureProposer()` hardcoded.

**What is already pack-ready:**
- Phase DAG (allowed predecessors, produces, may_edit_source, requires_approval, escape_hatch).
- Validator assignment per phase (advisory vs blocking declared; only built-in IDs execute).
- Grill question profile (`default` vs `doc_grounded`) and `max_questions`.
- Plan verification profile (`detected` vs `none`).
- Manifest metadata: `artifact_root`, `task_id_pattern`, `artifact_format`, `runtime_target`, `min_agent_os_version` (parsed; some not enforced).

**What blocks real skill packs today:**
1. Packs cannot inject prompt content — `/grill`, `/diagnose`, `/review` use hardcoded prompts.
2. Packs cannot define new artifact schemas.
3. Packs cannot define new validators (only reference 4 built-ins).
4. Packs cannot register new commands.
5. Packs cannot extend status/flight rendering for skill-specific state.

**Is `agent-os-core` a real pack or config over core?**
**Config over core.** Its `workflow-pack.yaml` declares 10 phases that map 1:1 to commands already hardcoded in `src/pi/extension.ts`. Its `validators[]` reference paths (`validators/validate-artifact.ts`) that **do not exist on disk inside the pack** — only the 4 built-in IDs in `validator-runner.ts:169-177` actually execute. The only fields that change runtime behavior are `grill.question_profile`, `grill.max_questions`, `plan.verification_profile`, and the phase DAG. Everything else is documentation of what core already does.

**Is Agent_OS now more than a governed shell around manual work?**
**Partially.** The governance and lifecycle are substantive. The "skill" content inside the lifecycle is still mostly the user's manual judgement, with prompt scaffolding from defaults. Two genuine pieces of intelligence have landed: doc-grounded grill questions and test-command auto-detection. The rest is honest manual work inside honest gates.

---

## 4. Pack seam depth assessment

| Capability | Currently pack-controlled? | Evidence | Needed for real skill packs? |
|---|---|---|---|
| Question generation | **Partial** — profile toggle only | `src/pi/extension.ts:501-525` selects `PackQuestionGenerator` (doc-grounded) vs `defaultQuestionGenerator` (fixed 7); pack provides profile + max_questions. Pack cannot inject question text. | **Yes — must be deepenable.** Packs need to supply question content, not just toggle two profiles. |
| Doc detection | **No** — heuristic is hardcoded | `src/core/doc-detector.ts:20-121` known-roots list is hardcoded (README, AGENTS, CLAUDE, CONTRIBUTING, `.agent-os/context.md`). | Maybe. A pack might want extra doc roots (e.g., `glossary.md`, `domain.md`) but this is a small ask. |
| Plan verification | **Partial** — profile toggle only | `src/pi/extension.ts:529-538` selects `PackPlanDrafter` (`detected`/`none`) vs `defaultPlanDrafter` (hardcoded `npm test`). | **Yes.** Packs should declare their own verification recipes (e.g., contract tests, mutation tests, golden-file diffs). |
| Implementation commands | **No** | `pack-plan-drafter.ts:49` always produces `commands: []`. Documented limitation #2: "Implementation commands remain empty by design." | No — keeping this honest is a feature. Manual implementation is explicit in product promise. |
| Validators | **Partial (declarative only)** | `src/core/validator-runner.ts:169-217`: only 4 built-in IDs run; unknown IDs return `null` and are skipped. Pack declares advisory vs blocking, but mode is only mechanically meaningful for built-ins. | **Yes — must support pack-defined validators.** Without this, the pack-declared `path:` field is dead. (But: this audit recommends declarative validators, not arbitrary code execution — see §8.) |
| Artifact schemas | **No** | `src/ccp/artifacts/*.ts` are closed TypeScript interfaces. | Maybe — adding new phase produces requires new artifact types; but most skill workflows can reuse existing artifacts with custom payload fields. Not v1.x. |
| Phase registry | **YES** | `src/core/phase-registry.ts:20` wraps `WorkflowPackManifest`. `loadWorkflowPacks` reads phases from manifest. Phase DAG, predecessors, approval, escape hatch all pack-controllable. | Already adequate. |
| UI / forms | **No** | No pack-driven UI hooks; `ui.confirm`, `ui.notify` etc. are direct API. | Not v1.x — let UX stay core-owned. |
| Memory capture | **No** | `src/ccp/commands/remember.ts:49` uses hardcoded `defaultCaptureProposer`. | No — memory remains human-gated, no pack-defined auto-capture. (Product constraint: no silent memory writes.) |
| Risk policy | **No** | `src/ccp/policy/tier-resolver.ts:44-58`: overrides only tighten, never loosen. Policy table hardcoded. | No — keep policy core-owned. (Product constraint: no unscoped execution.) |
| Status/flight rendering | **No** | `src/ccp/commands/status.ts:62-99`, `src/core/renderer.ts:45-80`, `projector.ts:62-80` all hardcoded. | Yes (long-term). Packs should be able to declare skill-specific status surfaces, but **not v1.x**. |
| Command registration | **No** | `src/pi/extension.ts:363-1320` 15 commands registered statically via `pi.registerCommand`. | **Eventually yes.** Packs should be able to declare a command for a phase. Not v1.x. |
| Workflow sequencing | **YES** | `allowed_predecessors` in `PhaseDefinition` enforced via `PhaseRegistry.checkPredecessors`. | Already adequate. |

**Pack seam verdict:**
- **Sufficient for v1.x governed workflow configuration.** ✓
- **Insufficient for general curated skill packs.** ✓ (the seam is shallow — toggles, not behavior)
- **Already deep enough for first-party skills.** ✗

The seam needs **one** focused deepening (prompt content injection) to carry the first real skill pack. Multiple deepenings simultaneously would over-extend v1.x.

---

## 5. Matt Pocock skills analysis (principles, not imports)

Principles inspected from `github.com/mattpocock/skills`. **Per audit constraint: no Matt skills are imported directly.** Only transferable engineering practices are evaluated.

| Skill | Purpose | Portability to Pi | Legacy-codebase value | Overlap with Agent_OS | Disposition |
|---|---|---|---|---|---|
| `grill-with-docs` | Doc-grounded Socratic grilling with codebase cross-reference, inline glossary writes, 3-gate ADR test | HIGH (pure prose + file writes) | HIGH — DDD-style glossary is more valuable on legacy than greenfield | Direct overlap with `/grill`; **extends** it with cross-ref, inline-glossary, ADR-rubric | **first-party pack** (principles → engineering-core) |
| `tdd` | Red-green-refactor with tracer-bullet vertical slices; ban horizontal slicing | HIGH as methodology; needs test-runner gates | MEDIUM-LOW — assumes test seam exists; on legacy code, `diagnose` is the entry point first | New territory | **first-party pack (deferred — v1.x.y, not v1.x.0)** |
| `diagnose` (6-phase loop) | Reproduce → minimise → falsifiable hypotheses → instrument with tagged logs → fix at correct seam → cleanup | HIGH (6-phase maps cleanly to phased Agent_OS workflow) | **VERY HIGH** — only Matt skill explicitly designed for codebases without test infrastructure (10-mechanism feedback-loop menu) | Direct overlap with `/diagnose`; **extends** it heavily | **first-party pack (principles → engineering-core)** |
| `improve-codebase-architecture` | Surface "deepening opportunities" using LANGUAGE.md vocabulary (Module/Interface/Implementation/Depth/Seam/Adapter/Leverage/Locality); ADR-aware | MEDIUM (refs `Agent` subagent dispatch; LANGUAGE.md is host-neutral) | VERY HIGH — deletion test + shallow-vs-deep diagnosis is exactly the legacy refactoring lens | New territory | **first-party pack (deferred — v1.x.y)** |
| `to-prd` | PRD synthesis from conversation; fixed template | MEDIUM (issue tracker abstraction needed) | LOW (PRDs are greenfield work) | New territory | **optional external pack — deferred** |
| `to-issues` | Tracer-bullet vertical-slice issue creation; HITL/AFK tagging; dependency-ordered publishing | MEDIUM (issue tracker) | LOW | New territory | **optional external pack — deferred** |
| `triage` | Issue state machine (5 states × 2 categories) | MEDIUM | LOW | New territory | **optional external pack — deferred** |
| `grill-me` | Minimal Socratic interview (no glossary, no ADR) | HIGH | MEDIUM | Subset of `/grill` | **reject** — already covered by `/grill` |
| `zoom-out` | One-liner: map relevant modules + callers in domain vocab | HIGH | HIGH | New territory but trivial | **reject as a skill** — too small to import; absorb as `/zoom-out` shortcut later or skip |
| `prototype` | Throwaway one-command logic/UI prototype | HIGH | LOW (greenfield-only) | New territory | **reject/defer** |
| `write-a-skill` | Authoring discipline for Claude-skill format | LOW (prescribes specific format) | N/A | Agent_OS has its own pack format | **reject** — write an Agent_OS-native equivalent if needed |
| `git-guardrails-claude-code` | PreToolUse hooks blocking destructive git | LOW (autonomous hook) | HIGH (as a principle) | Should be policy gate | **reject — re-implement principles as policy** (no autonomous hooks per product constraint) |
| `handoff` | Conversation handoff doc via `mktemp` | LOW (writes to mktemp) | LOW | Should write to knowledge-brain | **reject — re-implement via knowledge-brain** |
| `setup-matt-pocock-skills` | Bootstraps `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` | LOW (writes to CLAUDE.md/AGENTS.md) | N/A | Agent_OS has its own bootstrap | **reject** |
| `caveman`, `migrate-to-shoehorn`, `scaffold-exercises`, `setup-pre-commit`, personal/in-progress/deprecated | Various | varies | varies | varies | **reject/defer** |

**Three transferable principles to carry into v1.x:**
1. **Doc-grounded grilling with codebase cross-reference** (from `grill-with-docs`): if the user makes a claim about how code works, check the code; if it disagrees, surface the contradiction in the next question.
2. **Falsifiable hypothesis discipline** (from `diagnose`): every hypothesis must include "If X is the cause, then changing Y will make the bug disappear." A diagnosis without a falsifiable hypothesis is not yet a diagnosis.
3. **Tagged-log discipline** (from `diagnose`): every debug log added during diagnosis must carry a unique short prefix (e.g., `[DEBUG-a4f2]`). After a fix, a grep for the tag must return zero — that grep is the validator.

**Three transferable disciplines deferred past v1.x:**
1. ADR three-gate test (hard-to-reverse + surprising-without-context + real-trade-off) — needs an ADR primitive in Agent_OS first.
2. Architectural deepening vocabulary (Module/Interface/Implementation/Depth/Seam/Adapter/Leverage/Locality) — needs an "architecture-health" pack.
3. Tracer-bullet vertical-slice issue creation — needs an issue-tracker abstraction.

---

## 6. Capability taxonomy

| Category | Core (v1.x) | First-party pack (`engineering-core`, v1.x) | First-party pack (deferred) | External / custom pack (post-v1) | Reject / defer |
|---|---|---|---|---|---|
| **Alignment** (grilling, shared language, PRD, issue slicing) | `/grill` default sequence, doc-detection scaffolding | Doc-grounded grill with codebase cross-reference (principles from `grill-with-docs`); inline glossary writes | PRD / issue slicing (needs ADR + issue-tracker primitive) | Issue-tracker-specific PRD packs | `setup-matt-pocock-skills`-style bootstrap |
| **Discovery / understanding** (zoom-out, orientation, architecture map, legacy impact) | Doc detector (read-only, deterministic, bounded) | — | Architecture-health pack (deepening vocabulary, deletion test, ADR-aware) | `zoom-out` as user shortcut | — |
| **Execution discipline** (TDD, diagnose, run/verify/review loop, regression test discipline) | `/run` `/verify` `/review` (mechanical); test-command detector | Phased `/diagnose` (6-phase: reproduce → minimise → falsifiable hypothesise → tagged-log instrument → fix-at-seam → cleanup); regression-test-required gate | TDD pack with RED/GREEN gates | — | — |
| **Architecture health** | — | — | `architecture-health` pack | Custom modules-of-concern packs | — |
| **Product / planning** | `/plan` (mechanical) | — | PRD pack; issues pack | Org-specific PRD templates | — |
| **Safety / governance** | Policy tiers, dangerous-pattern matching, phase-aware escalation, approval gates, memory human-gating | — | — | — | `git-guardrails-claude-code` (hooks); any autonomous-hook pattern |
| **Meta** (write-a-skill, skill setup) | Pack loader, doctor, init, semver | — | An Agent_OS-native `write-a-pack` once the seam stabilises | — | Matt's `write-a-skill` |

---

## 7. Architectural options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Hardcode curated skills into core** (`/tdd`, `/diagnose-rich`, `/architecture-review` as core commands) | Ships fast; no seam work; users get value immediately; no install ceremony | Every skill upgrade = Agent_OS release; "skill system" becomes a marketing term over hardcoded commands; the pack abstraction loses purpose; bloat over time | **Reject for v1.x.** Acceptable as a one-off if seam-deepening is impossible, but seam-deepening is cheap so this trade is wrong. |
| **B. Keep core minimal; ship first-party packs** | Real skill system; pluggable; replaceable; versioned independently per pack; core stays boring | Pack seam must deepen first; testing infrastructure for packs needs more discipline; pack-version compatibility surface area | **Recommended path, but BLOCKED on §10 Phase 1.** Cannot ship a meaningful pack today — seam can only configure toggles. Ship after seam deepens. |
| **C. External skill imports / adapters (e.g., ingest mattpocock/skills format)** | Lots of prior art; community size | Supply chain risk; host-specific assumptions (`.claude/`, hooks, subagent dispatch); version drift; trust model becomes hard; v1 constraint prohibits Claude-only hooks | **Reject for v1.x.** Defer past v2 or never; extract principles, do not import format. |
| **D. Hybrid — core owns universal primitives; packs own engineering behavior** | Boring core + flexible behavior; matches the product promise (governed, observable, verifiable); aligns with existing seam direction | Requires seam deepening before payoff | **Strategic direction.** The recommendation in §1 is option D + execution path B. |
| **E. Do nothing for v1.x; dogfood more** | Lowest risk; prior pass said broader-dogfood ready | Original pain point stays unsolved; the "skeletal" feeling becomes load-bearing in user expectation; opportunity cost on `/diagnose` which is the weakest core command | **Reject.** Prior pass already greenlit dogfood; this audit is the design follow-up. Inaction does not resolve the pain. |

---

## 8. Proposed skill / workflow-pack model

### Definitions

- **Workflow:** an ordered set of phases enforced by `PhaseRegistry`. Already implemented. A workflow is what `agent-os-core` describes.
- **Skill:** in Agent_OS v1.x, a skill is the **pack-provided content + configuration that customises one or more phases of a workflow**. A skill is not a separate primitive — it is the substantive content carried inside a pack. Skills are inspectable (markdown/YAML), versioned (pack semver), testable (golden artifact tests), replaceable (re-install a different pack), bounded (read by core, never executed), and policy-governed (core controls execution, policy, and memory).
- **A workflow composes phases. A skill enriches a phase.** Multiple skills can enrich the same phase across packs; v1.x supports one active pack so this is a future concern.

### Manifest shape (minimum needed to support `engineering-core`)

Backward-compatible extension to `workflow-pack.yaml`:

```yaml
workflow_pack_id: engineering-core
version: "1.0.0"
schema_version: "1.0.0"        # bumped to 1.1.0 if new fields below are required
runtime_target: pi
min_agent_os_version: "1.5.0"  # the release that adds prompt-template seam

# existing fields unchanged: grill, plan, phases, validators, artifact_root, etc.

# NEW: declarative prompt templates per phase. Read-only data, not executable.
prompts:
  grill:
    intro: prompts/grill/intro.md            # optional; replaces hardcoded grill preamble if present
    question_packs:                          # optional; supplements PackQuestionGenerator sequence
      - prompts/grill/legacy-safe.md         # markdown file; one question per H2 heading
  diagnose:
    phases:                                  # optional; if present, /diagnose runs the listed sub-phases
      - id: build-feedback-loop
        prompt: prompts/diagnose/01-loop.md
        exit_condition: feedback_loop_confirmed   # named flag; set by user "done" / agent confirmation in the diagnosis-record artifact. NOT an automated code check.
      - id: reproduce
        prompt: prompts/diagnose/02-reproduce.md
        exit_condition: reproduction_confirmed
      - id: falsifiable-hypothesis
        prompt: prompts/diagnose/03-hypothesise.md
        exit_condition: hypothesis_stated
        validator: validate-falsifiable-hypothesis
      - id: instrument
        prompt: prompts/diagnose/04-instrument.md
        exit_condition: instrumentation_acknowledged
      - id: fix-at-seam
        prompt: prompts/diagnose/05-fix.md
        exit_condition: fix_applied_or_no_seam_reported
      - id: cleanup
        prompt: prompts/diagnose/06-cleanup.md
        validator: validate-no-stray-debug-tags
```

### Ownership

| Concern | Owner |
|---|---|
| Artifact schemas | **Core.** Closed in v1.x. |
| Command set | **Core.** Closed in v1.x — packs do not register new slash commands. |
| Validators | **Core for execution; pack for declaration and assignment.** Pack declares which validators (built-in + a small new set of pack-aware ones — see below) run on which phases with which mode. **No arbitrary code execution from packs.** Per audit constraint: no validator path execution. |
| Validator content | **Mixed.** Built-in IDs ship in core. Pack-aware validators (e.g., `validate-falsifiable-hypothesis`, `validate-no-stray-debug-tags`) ship in core too but accept pack-provided parameters (e.g., the debug-tag regex from the pack manifest). |
| UI / forms | **Core.** Closed in v1.x. |
| Memory capture rules | **Core.** Closed in v1.x — no pack-driven memory automation. |
| Risk / policy | **Core.** Closed in v1.x. |
| Prompt content | **Pack (new seam).** Read-only markdown/YAML, consumed by core commands. |
| Phase composition for `/diagnose` | **Pack (new seam) — opt-in.** If pack declares `prompts.diagnose.phases`, `/diagnose` runs as a phased loop. Otherwise default fixed-prompt behaviour. |
| Versioning | **Pack semver + bundled-vs-installed comparison via `/doctor`.** Already implemented. |
| Installation | **`/init` copies bundled pack dir to `.agent-os/packs/<pack-id>/`.** Already implemented. `/init --upgrade --force` reinstalls. |
| Disabling / customisation | **User can `rm -rf .agent-os/packs/<pack-id>/` and run `/doctor`** — system reverts to default behaviour. To customise, user edits the on-disk `workflow-pack.yaml` and `prompts/*.md`. `/doctor` reports "newer-than-bundled" or "modified-locally" so the user knows divergence. (`modified-locally` is a new doctor state.) |

### What is already supported

- Phase DAG, predecessors, approval, escape hatch
- Validator assignment (advisory / blocking; built-in IDs only)
- Grill profile and max questions
- Plan verification profile
- Versioning, bundled-vs-installed comparison
- Stale recovery via `/init --upgrade --force`

### What is missing for `engineering-core`

1. **`prompts/` directory in pack manifest** with markdown content keyed per phase or per question pack. Loader reads, validates UTF-8, size-bounds (10KB/file, 200KB total), and surfaces missing files as soft-fail warnings — not load failures.
2. **`prompts.diagnose.phases[]` schema** allowing pack-declared sub-phases of `/diagnose` with exit conditions and per-phase validator assignment.
3. **Two new built-in validators**:
   - `validate-falsifiable-hypothesis`: parses the hypothesis field of a diagnosis artifact; requires it to contain "if … then …" structure.
   - `validate-no-stray-debug-tags`: greps the repo for a pack-configured debug-tag pattern; fails if any matches remain after diagnose cleanup phase.
4. **Test strategy:** see §12.

---

## 9. Recommended first-party pack: `engineering-core`

**Name:** `engineering-core`
**Version:** `1.0.0` (after Phase 1 seam deepening ships in Agent_OS v1.5.0)
**Bundled location:** `src/ccp/commands/init/packs/engineering-core/`

**Included workflows:**
1. **Doc-grounded grill upgrade** (extends `agent-os-core` grill profile)
   - Adds codebase cross-reference: if a user statement is verifiable against code, the question is rewritten to cite the conflict.
   - Adds inline glossary write: when a term is resolved, write to `.agent-os/glossary.md` (or pack-configured path).
   - Adds optional question pack `legacy-safe.md` for unknown-test-stack repos (asks about test seam, blast radius, rollback path before functional questions).
2. **Phased `/diagnose` workflow**: 6 sub-phases (build-feedback-loop, reproduce, falsifiable-hypothesise, instrument, fix-at-seam, cleanup) with the two new validators wired.

**Excluded workflows:**
- TDD (deferred to `engineering-core` v1.1 or a separate `tdd-pack`)
- Architecture deepening (deferred to `architecture-health` pack)
- PRD / issues / triage (deferred; needs issue-tracker abstraction)
- ADR generation (deferred; needs ADR primitive in core)

**Why these first:**
- `/diagnose` is the weakest core command and the highest-leverage upgrade.
- Doc-grounded grill upgrade has the most concrete user-felt improvement per line of code shipped.
- Both run on **any** codebase regardless of size, language, or test maturity.
- Both honour the no-autonomous-execution constraint — they only enrich the prompts core already runs.

**What user problem it solves:**
- Today `/diagnose` is a flat prompt sequence; users want a disciplined bug-fix loop. After: a 6-phase loop with falsifiable hypotheses and tagged-log cleanup validation, explicit "no-seam-is-the-finding" honesty.
- Today `/grill` doc-grounding picks up README headings; users want it to challenge their statements against actual code. After: cross-reference + glossary writes + opt-in legacy question pack.

**Legacy-codebase fit:**
- **Java/Spring monolith (no tests):** `/diagnose` sub-phase 1 (build feedback loop) offers 10 mechanisms; sub-phase 5 honours "no correct seam = the finding" — fix lands, but a regression-test gap is recorded honestly.
- **TypeScript frontend:** test-command-detector already supports npm; doc-grounding works against AGENTS.md / CLAUDE.md.
- **Python service:** pytest detection works; doc-grounding works.
- **Mixed-language repo:** `detectTestCommands` returns multiple candidates; pack consumes first.
- **Repo with flaky tests:** falsifiable-hypothesis validator forces the user to state what would prove flakiness vs real bug.
- **Repo with strict governance:** phase gates and approval requirements remain unchanged; pack only enriches prompts.

**Minimum viable artifacts** (existing schemas reused):
- `grill-record.yaml` (with optional new `glossary_updates[]` field — additive, schema bump only)
- `diagnosis-record.yaml` (with optional new `phase`, `hypotheses[]`, `feedback_loop`, `instrumentation_tag` fields — additive, schema bump only)

**Minimum viable verification:**
- `validate-artifact` (existing)
- `validate-criteria-coverage` (existing)
- `validate-falsifiable-hypothesis` (new built-in, pack-parameterised)
- `validate-no-stray-debug-tags` (new built-in, pack-parameterised)

---

## 10. Minimal v1.x implementation plan

Staged. Each phase is independently shippable. Two parallel tracks within each phase: **Pack track** (seam + pack content) and **UI track** (narration + snapshots).

### Phase 1 — Pack seam deepening + auto-narration baseline (Agent_OS v1.5.0)
**Goal:** add the smallest seam that lets a pack carry behavior, AND standardize structured auto-narration so the user sees every system action in the terminal.

**Pack track — files likely involved:**
- `src/core/workflow-pack-loader.ts` — extend `WorkflowPackManifest` with optional `prompts` field; size-bounded read (10KB/file, 200KB total); UTF-8 only.
- `src/core/pack-question-generator.ts` — accept optional pack-provided question content from `prompts.grill.question_packs[]`.
- `src/ccp/commands/diagnose.ts` — when active pack declares `prompts.diagnose.phases[]`, run as phased loop; otherwise existing fixed-prompt path.
- `src/core/validator-runner.ts` — add two new built-in validator IDs (`validate-falsifiable-hypothesis`, `validate-no-stray-debug-tags`) accepting pack-provided parameters from manifest.
- `src/ccp/artifacts/diagnosis-record.ts` — additive fields (phase, hypotheses[], feedback_loop, instrumentation_tag), schema_version bump.
- `src/ccp/artifacts/grill-record.ts` — additive fields (glossary_updates[]), schema_version bump.

**UI track — files likely involved:**
- `src/pi/extension.ts` — audit all `ui.notify` call sites; standardize to a tagged-prefix scheme. Add missing notifications at the boundaries listed below.
- `src/core/events.ts` and `src/core/event-log.ts` — every emitted event also produces a one-line narration via a new `narrate(event)` helper (so the event log and the user terminal stay in lockstep).
- New file `src/core/narrator.ts` — single source of truth for `[tag] human-readable` line formatting. Tag scheme: `[pack]`, `[phase]`, `[doc]`, `[validator]`, `[step]`, `[memory]`, `[plan]`, `[verify]`, `[review]`, `[evaluate]`, `[doctor]`, `[trace]`.

**Auto-narration coverage (must emit a line at minimum):**
- Pack load: `[pack] agent-os-core v1.2.0 loaded` / `[pack] load failed: <reason>`
- Pack staleness: `[pack] agent-os-core v1.0.0 stale; bundled v1.2.0` (info during command, not just `/doctor`)
- Phase enter: `[phase] GRILLING — question 2 of 8`
- Phase transition: `[phase] SHARED_UNDERSTANDING → next: /plan`
- Doc detection: `[doc] using AGENTS.md, CLAUDE.md as grounding sources`
- Test detection: `[plan] detected verification: pytest (pyproject.toml)`
- Validator: `[validator] validate-artifact: passed` / `[validator] validate-plan-scope: 2 findings`
- Memory: `[memory] 3 candidates pending approval`
- Approval boundary: `[step] requires approval — tier 3`

**Tests required (Phase 1):**
- Pack loader: prompts directory accepted; missing prompts emit soft-fail; oversized prompt rejected; UTF-8 only enforced.
- Phased diagnose: with pack declaring phases, sub-phases run in order; `exit_condition` flag in artifact gates each.
- New validators: positive and negative cases; pack-parameter handling.
- Backwards compat: `agent-os-core` (which has no `prompts`) continues to load and run unchanged.
- Narrator: each tag formats consistently; narrator emits no PII / no raw payload.
- Coverage: every command (`/grill`, `/plan`, `/run`, `/verify`, `/review`, `/evaluate`, `/diagnose`, `/quick-task`, `/remember`, `/doctor`) emits at least one phase-enter narration line.

**Non-goals (Phase 1):**
- No new commands.
- No pack-driven artifact schemas (only additive fields).
- No external pack distribution.
- No pack-driven UI / status rendering (UI stays core-owned).
- No setup-workflow phase.
- No LLM planning.
- No validator path execution.
- No persistent TUI region. Narration is sequential `ui.notify` lines.

**Risks (Phase 1):**
- Narration becomes noise. Mitigated by tag scheme (users can mentally filter), and a future `verbose: false` setting if needed.
- Markdown prompt content quality is the new variable. Mitigated by golden-artifact tests and review during authoring.
- `/diagnose` UX change is user-visible; existing users of `agent-os-core` continue to get vanilla — phased loop is opt-in by installing `engineering-core` in Phase 2.

### Phase 2 — Ship `engineering-core` pack + richer snapshot commands (Agent_OS v1.5.0)
**Goal:** prove the seam carries real behavior by shipping one substantive pack, AND upgrade `/status`, `/flight`, `/doctor`, `/trace` to dense ANSI snapshots that surface pack state, validator outcomes, and progress.

**Pack track — files likely involved:**
- `src/ccp/commands/init/packs/engineering-core/workflow-pack.yaml`
- `src/ccp/commands/init/packs/engineering-core/prompts/grill/intro.md`
- `src/ccp/commands/init/packs/engineering-core/prompts/grill/legacy-safe.md`
- `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/0[1-6]-*.md` (6 sub-phase prompts: build-feedback-loop, reproduce, falsifiable-hypothesise, instrument, fix-at-seam, cleanup)
- `src/ccp/commands/init/packs/engineering-core/README.md` — what this pack does, when to use it.

**UI track — files likely involved:**
- `src/ccp/commands/status.ts` — replace text-only state-to-action with dense block: pack badge (`pack:engineering-core@1.0.0 ✓ current`), phase progress (`[████████░░] 4/5`), validator summary (`validators: ✓4 ✗0 ⚠0`), memory state (`memory: 3 candidates pending`), health line (`● healthy`), concrete next-action line.
- `src/ccp/commands/trace.ts` — upgrade to a denser timeline with ANSI columns: time, tag, message, optional duration.
- `src/core/renderer.ts` — extend timeline event filter to include narration tags; add `renderPackBadge`, `renderProgressBar`, `renderValidatorSummary` helpers.
- `src/core/projector.ts` — extend `SessionDashboard` projection with pack state, validator outcomes, sub-phase position (for engineering-core's phased diagnose).
- `src/ccp/commands/doctor.ts` — upgrade output to a dense status block: every check on its own line with `✓`/`✗`/`⚠` glyphs, pack version row with state badge, recovery hint inline.
- `src/ccp/commands/flight.ts` (if separate from status — currently in extension.ts) — same denser rendering, scoped to recent task lifetime.

**Tests required (Phase 2):**
- Pack loads cleanly via `loadWorkflowPacks`.
- Pack registers via `/init` (with pack-selection prompt when multiple bundled).
- `/doctor` reports `engineering-core v1.0.0 current` when bundled and installed match.
- Phased `/diagnose` produces a `diagnosis-record.yaml` with the new fields populated.
- Renderer: `renderPackBadge` produces stable ANSI string for each pack state (`current`/`stale`/`newer`/`unknown`/`modified-locally`).
- Renderer: `renderProgressBar` deterministic for given (current, total).
- Renderer: `renderValidatorSummary` aggregates findings across phase validators.
- Snapshot test: `/status` output for a known fixture matches expected ANSI snapshot.
- Snapshot test: `/doctor` output for a fresh install vs stale-pack scenario.
- Snapshot test: `/trace` output for a completed task.

**Non-goals (Phase 2):**
- Replacing `agent-os-core`. Both ship bundled. Installing `engineering-core` is a separate choice (`/init --pack engineering-core` or `/init` prompts when multiple bundled).
- Pack merging (audit constraint).
- Multi-pack runtime (audit constraint).
- Pack-driven status / flight rendering — UI stays core-owned in v1.x; only core's knowledge of pack state is surfaced.
- Persistent TUI region.

**Risks (Phase 2):**
- Pack selection UX: users may install `agent-os-core` and never discover `engineering-core`. Mitigated by `/init` prompting when multiple packs are bundled.
- ANSI rendering varies across terminals (Windows Terminal, iTerm2, basic TTY). Mitigated by ASCII-fallback path for any glyph we use and TTY-detection.

### Phase 3 — Tests, dogfood fixtures, narration coverage (Agent_OS v1.5.0)
**Goal:** prove the pack works on real shapes AND prove the narration covers every command path with no silent steps.

**Fixtures:**
- Java/Spring fixture (no tests)
- Python pytest fixture
- TypeScript vitest fixture
- Mixed Go + TS fixture
- Repo with placeholder npm test
- Repo with no recognised test stack

**For each fixture:**
- `/grill` produces grill-record with at least one cross-reference question.
- `/diagnose` runs all 6 sub-phases.
- `validate-no-stray-debug-tags` correctly detects and rejects stray tags after cleanup phase.
- `validate-falsifiable-hypothesis` rejects non-falsifiable hypotheses.
- **Narration capture:** record the exact `ui.notify` line sequence per command and assert no silent transitions. Test fixture asserts the sequence matches the documented expected boundaries.
- **Snapshot capture:** `/status` and `/doctor` outputs captured after each phase transition; diff against committed snapshots.

**Non-goals:**
- Performance benchmarks.
- Auto-fix or auto-recovery (no autonomous behavior).

**Risks:**
- Test fixtures may not exercise the real legacy-codebase pain. Mitigated by §7 legacy-codebase stress test discipline.
- ANSI snapshot tests are brittle across terminal widths. Mitigated by fixed-width rendering for snapshot mode + a separate live-mode that auto-fits.

### Phase 4 — Docs and starter integration (Agent_OS v1.5.0)
**Goal:** make the pack discoverable, the narration explainable, and the snapshot rendering documented.

**Files likely involved:**
- `Agent_OS/README.md` — explain the difference between `agent-os-core` (workflow) and `engineering-core` (workflow + discipline); show example `/status` snapshot.
- `Agent_OS/AGENT_OS_ROADMAP.md` — record Phase-1-through-4 outcomes.
- `Agent_OS/docs/2026-05-14-skill-pack-architecture-audit.md` — this document.
- `Agent_OS/docs/narration-tags.md` — new doc listing every narration tag and the events that emit it.
- `agent-os-starter/README.md` — add glossary section: pack vs workflow vs skill vs phase; show example narration stream.
- `agent-os-starter/setup.sh` — optionally accept `--pack engineering-core` for advanced users.

**Tests required:**
- Smoke test in `agent-os-starter` covers both `agent-os-core` and `engineering-core` install paths.
- Doc-link integrity: `narration-tags.md` lists every tag emitted by the narrator; CI fails if a new tag is added without doc update.

**Non-goals:**
- Marketing surface.
- External pack registry.

**Risks:**
- Docs go stale. Mitigated by adding a CI check that the README pack list matches the bundled `packs/` directory.

---

## 11. Explicitly rejected for now

The following are out of scope for v1.x. They may be revisited in v2+ with explicit ADR.

| Rejected | Reason |
|---|---|
| Copying all Matt Pocock skills directly | Audit constraint. Format prescribes Claude-specific assumptions; principles are valuable, direct ports are not. |
| Making Agent_OS core huge (Option A) | Violates "stable, boring runtime"; bloat over time; trades short-term win for long-term abstraction debt. |
| Building a generic marketplace | Premature for N=2 packs; trust model unclear; supply chain risk. |
| Relying on Claude-only hooks | Pi-only v1 runtime; Claude Code hooks are not portable. |
| Adding autonomous memory writes | Product constraint: no silent memory writes. |
| Adding multi-harness support | Pi-only v1 runtime. |
| Forcing issue tracker integration | `to-prd`, `to-issues`, `triage` all require an issue tracker abstraction; not v1.x. |
| Making packs bypass policy gates | Product constraint: no unscoped execution. |
| Generating fake implementation commands | Documented limitation #2 + product promise: a painful manual step is acceptable if honest. |
| Pack-driven validator code execution | Audit constraint: no validator path execution. Validators remain core code; packs provide parameters only. |
| Pack-driven LLM planning | Audit constraint: no LLM planning. |
| Pack merging | Audit constraint. v1.x supports one active pack. |
| Pack-driven command registration | Defer. Command surface stable in v1.x. |
| Pack-driven artifact schemas | Defer. v1.x adds optional fields only; schemas remain closed. |
| Pack-driven status / flight rendering | Defer. |
| External pack distribution (e.g., `pi pack install github:owner/repo`) | Defer to v2.x. Bundled is sufficient for v1.x and avoids supply chain. |
| Setup-workflow phase | Audit constraint. |

---

## 12. Test strategy

Tests must prove:

| Test | Type | Proves |
|---|---|---|
| `pack-loader.prompts-field-parsed` | unit | Pack with `prompts:` section loads; prompts referenced by relative path resolve. |
| `pack-loader.missing-prompt-soft-fail` | unit | Pack referencing a missing prompt file emits warning, does not crash load. |
| `pack-loader.oversized-prompt-rejected` | unit | Prompt files > 10KB are rejected with clear error; total prompt budget > 200KB rejected. |
| `pack-loader.utf8-only` | unit | Non-UTF-8 prompts rejected. |
| `diagnose.fixed-prompt-when-no-phases` | unit | Pack without `prompts.diagnose.phases` keeps existing fixed-prompt behavior (backwards compat). |
| `diagnose.phased-loop-when-phases-declared` | unit | Pack with phases runs each sub-phase in order; gates on `exit_condition`. |
| `diagnose.appears-in-status-flight` | unit | `/status` and `/flight` show current diagnose sub-phase when phased loop is running. |
| `validator-runner.falsifiable-hypothesis-positive` | unit | Hypothesis containing "if … then …" passes. |
| `validator-runner.falsifiable-hypothesis-negative` | unit | Hypothesis lacking falsifiable structure fails with finding. |
| `validator-runner.no-stray-debug-tags-positive` | unit | Repo with no debug-tag matches passes. |
| `validator-runner.no-stray-debug-tags-negative` | unit | Repo with stray `[DEBUG-a4f2]` tag fails with finding citing file:line. |
| `pack.engineering-core-loads` | integration | `engineering-core` bundled pack parses, loads, registers via `/init`. |
| `pack.engineering-core-appears-in-doctor` | integration | `/doctor` reports `engineering-core` version status (current / stale / newer). |
| `pack.engineering-core-disable` | integration | After `rm -rf .agent-os/packs/engineering-core/`, system reverts to defaults; `/doctor` does not report stale. |
| `pack.engineering-core-stale-detected` | integration | Install v1.0.0, bump bundled to v1.0.1, run `/doctor` → reports stale + `/init --upgrade --force`. |
| `pack.unscoped-execution-blocked` | integration | Even with `engineering-core` installed, `/run` write attempts outside EXECUTING phase get tier-3 escalated. |
| `pack.no-fake-verification` | integration | On an unknown-test-stack repo, `engineering-core` plan verification command is `[]`, not `npm test`. (Re-runs the prior dogfood scenario.) |
| `pack.legacy-fixture-java-no-tests` | integration | On Java/Spring fixture with no tests, `/diagnose` 6-phase loop completes; `fix-at-seam` records "no-correct-seam-is-the-finding" when no test seam exists. |
| `pack.legacy-fixture-flaky-tests` | integration | Falsifiable-hypothesis validator forces user to state flakiness vs real-bug discriminator. |
| `init.pack-selection-prompt` | integration | When multiple bundled packs are available, `/init` asks the user which to install (or default to `agent-os-core`). |
| `pack.cannot-bypass-memory-gate` | integration | Pack-defined diagnose phase that writes to `knowledge-capture-record` still triggers human approval gate. |

**UI track tests (added scope):**

| Test | Type | Proves |
|---|---|---|
| `narrator.tag-format-stable` | unit | Every `[tag]` produces a consistent line format; no PII / no raw payload leakage. |
| `narrator.no-silent-command` | integration | For each of `/grill /plan /run /verify /review /evaluate /diagnose /quick-task /remember /doctor`, command emits at least one phase-enter narration line. |
| `narrator.pack-events-narrated` | integration | Pack load, stale detection, load failure each emit a `[pack]` line. |
| `narrator.validator-events-narrated` | integration | Every validator run emits `[validator]` line with pass/fail count. |
| `narrator.memory-events-narrated` | integration | Memory candidate proposed / approved / declined emit `[memory]` lines. |
| `renderer.pack-badge` | unit | `renderPackBadge` produces stable ANSI for each pack state. |
| `renderer.progress-bar` | unit | `renderProgressBar` deterministic for given (current, total). |
| `renderer.validator-summary` | unit | Aggregates findings across phase validators. |
| `status.snapshot-fresh-task` | snapshot | `/status` output for fresh-task fixture matches committed ANSI snapshot. |
| `status.snapshot-mid-task-grilling` | snapshot | `/status` after 4 of 8 grill questions matches snapshot (shows progress bar). |
| `status.snapshot-stale-pack` | snapshot | `/status` when pack is stale shows pack badge with stale state + recovery hint. |
| `doctor.snapshot-fresh-install` | snapshot | `/doctor` output for fresh `/init` matches snapshot. |
| `doctor.snapshot-stale-pack` | snapshot | `/doctor` for stale-pack fixture matches snapshot with recovery hint. |
| `trace.snapshot-completed-task` | snapshot | `/trace` output for a fully-completed task lifetime matches snapshot. |
| `renderer.ascii-fallback` | unit | When TTY does not advertise UTF-8 / ANSI, renderer falls back to plain ASCII without breaking layout. |

**Coverage gap to close from prior audit** (cited in §4 of pack-seam inspection):
- ✗ No test for `ensurePacksLoaded` caching and multi-pack ignoring — add `pack-loader.first-valid-wins`.
- ✗ No test for validator execution — partially addressed by new validator tests above.
- ✗ No test for `PackPlanDrafter.detectedCommands` UI surfacing — add `plan.detected-commands-surfaced-in-summary`.

---

## 13. Final recommendation

**Choice: B — implement a small pack-seam deepening patch.**

**Why not A (no implementation yet, design unsettled):** The design IS settled. This audit completes the design. Further deliberation without code feedback is theoretical optimisation.

**Why not C (implement the first real first-party pack today):** Impossible without seam deepening. With today's seam, `engineering-core` would only toggle `agent-os-core` differently (different phase DAG, different `max_questions`) — that is not a first real pack, it is a duplicate manifest. Shipping such a pack would damage the credibility of the pack abstraction.

**Why not D (broader dogfood first):** Prior release-readiness pass already concluded broader dogfood ready. This audit answers a different question (architecture), and the answer does not depend on more usage data. The seam-too-shallow finding is mechanical, not experiential.

**Smallest implementation prompt for the next session** (Phase 1, two parallel tracks), copy-pasteable:

```text
Task: Phase 1 of skill-pack architecture audit, per docs/2026-05-14-skill-pack-architecture-audit.md §10.

Two parallel tracks, both shipping together as Agent_OS v1.5.0.

TRACK A — Pack seam deepening
Goal: extend the pack seam with one read-only data field (prompt content) so a pack
can carry behavior without violating "no validator path execution" or "no LLM planning."

A1. Extend WorkflowPackManifest in src/core/workflow-pack-loader.ts with optional `prompts`
    field. Parse, validate UTF-8, size-bound (10KB/file, 200KB/total). Missing prompts emit
    soft-fail warning, not load failure.
A2. Extend src/ccp/commands/diagnose.ts: when active pack declares `prompts.diagnose.phases[]`,
    run /diagnose as the declared sub-phase loop with exit conditions in the diagnosis-record
    artifact; otherwise keep existing fixed-prompt behavior. Update DiagnosisRecord schema
    with additive `phase`, `hypotheses[]`, `feedback_loop`, `instrumentation_tag` fields
    (schema_version bump).
A3. Add two new built-in validators in src/core/validator-runner.ts:
    - validate-falsifiable-hypothesis (parses diagnosis artifact hypothesis field; requires
      "if X then Y" structure)
    - validate-no-stray-debug-tags (greps repo for pack-configured tag regex; fails if matches
      after cleanup phase)

TRACK B — Auto-narration baseline
Goal: ensure the user sees every system action in the terminal as a tagged narration line.

B1. Create src/core/narrator.ts: single source of truth for `[tag] message` formatting.
    Supported tags: [pack], [phase], [doc], [validator], [step], [memory], [plan], [verify],
    [review], [evaluate], [doctor], [trace]. Narrator emits no PII / no raw payload.
B2. Audit every `ui.notify` call site in src/pi/extension.ts. Standardize prefix scheme.
    Add missing notifications at these boundaries (minimum coverage, see §10 Phase 1 for
    the full list): pack load, pack staleness, phase enter, phase transition, doc detection,
    test detection, validator pass/fail, memory candidate proposed, approval-required step.
B3. Wire src/core/events.ts so every emitted event also produces a narrator line — event
    log and user terminal stay in lockstep.

Tests (Track A + Track B): see §12 of the audit for the full table. Minimum:
- Track A: pack-loader.prompts-field-parsed, pack-loader.missing-prompt-soft-fail,
  pack-loader.oversized-prompt-rejected, pack-loader.utf8-only,
  diagnose.fixed-prompt-when-no-phases (backwards compat),
  diagnose.phased-loop-when-phases-declared, both new validators positive and negative.
- Track B: narrator.tag-format-stable, narrator.no-silent-command (for all 10 commands),
  narrator.pack-events-narrated, narrator.validator-events-narrated.

Out of scope (must not do):
- No new commands.
- No pack-driven artifact schemas beyond additive fields.
- No external pack distribution.
- No pack-driven UI / status rendering (UI stays core-owned; Track B improves core UI,
  it does not let packs control rendering).
- No persistent TUI region. Narration is sequential ui.notify lines.
- No richer /status /flight /doctor /trace snapshots yet — that is Phase 2.
- No engineering-core pack content yet — that is Phase 2.
- No setup-workflow phase.
- No LLM planning.
- No validator path execution (validators remain core code; packs provide parameters only).
- Do not import any Matt Pocock skill content directly.

Verify:
- npm test passes (all existing + new).
- npx tsc --noEmit 0 errors.
- agent-os-core (existing pack) still loads unchanged.
- /doctor reports current for agent-os-core.
- A manual /grill run on a fixture repo emits a complete narration stream with no
  silent transitions.

Reference: docs/2026-05-14-skill-pack-architecture-audit.md.
```

After Phase 1 lands, Phase 2 (ship `engineering-core`) and Phases 3-4 (tests, fixtures, docs) follow per §10. Each ships independently.

---

## Appendix A — Key code citations

For verification by future readers:

- `src/pi/extension.ts:14-39` — hardcoded command imports
- `src/pi/extension.ts:196-268` — `ensurePacksLoaded`, first-valid-pack-wins
- `src/pi/extension.ts:363-1320` — 15 commands registered via `pi.registerCommand`
- `src/pi/extension.ts:501-525` — `buildGrillGenerator` selects Pack vs default
- `src/pi/extension.ts:529-538` — `buildPlanDrafter` selects Pack vs default
- `src/pi/extension.ts:1341-1360` — phase-aware tier escalation for write tools
- `src/ccp/commands/shared/plan-drafter.ts:34-62` — `defaultPlanDrafter` with hardcoded `npm test`
- `src/ccp/commands/shared/question-generator.ts:18-76` — `defaultQuestionGenerator` 7-question sequence
- `src/core/workflow-pack-loader.ts:5-44` — manifest schema
- `src/core/workflow-pack-loader.ts:161-193` — `loadWorkflowPacks`
- `src/core/pack-plan-drafter.ts:8-60` — `PackPlanDrafter` with `detectTestCommands`
- `src/core/pack-question-generator.ts:15-95` — `PackQuestionGenerator` with `buildSequence`
- `src/core/test-command-detector.ts:18-33` — `maybePkgTestScript` placeholder rejection (line 28)
- `src/core/test-command-detector.ts:49-81` — `detectTestCommands` for Rust/Go/Maven/Gradle/pytest/npm/Make
- `src/core/doc-detector.ts:20-121` — `detectDocs` with `KNOWN_ROOTS`
- `src/core/doctor.ts:42-75` — `resolvePackVersionDetail`
- `src/core/semver.ts:20-30` — `compareSemver`
- `src/core/validator-runner.ts:169-217` — `BUILT_IN_VALIDATORS` map and `runBuiltinValidator` (unknown IDs return `null`)
- `src/core/memory-router.ts:19-31` — `buildMemoryRoute` hardcoded paths
- `src/ccp/policy/tier-resolver.ts:44-58` — overrides tighten only
- `src/ccp/commands/init/packs/agent-os-core/workflow-pack.yaml` — bundled pack manifest in full
- `src/ccp/commands/remember.ts:34-204` — memory capture with explicit human approval at line 96

## Appendix B — Documented limitations carried from prior pass

1. `brain_db_path` and `install_manifest` may soft-fail on fresh installs.
2. Implementation commands remain empty by design.
3. Users must edit `plan.yaml` before `/run`.
4. Stale pack recovery path is `/init --upgrade --force`.
5. `defaultPlanDrafter` fallback still hardcodes `npm test`, but only when no valid pack loads.
6. No UX signal when custom non-bundled packs cannot be version-compared.

None are blockers for shipping Phase 1.
