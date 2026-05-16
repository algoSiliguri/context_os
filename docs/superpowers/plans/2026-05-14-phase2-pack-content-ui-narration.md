# Phase 2 Implementation Plan — engineering-core pack content + snapshot UI + full narrator audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land all three Phase 2 tracks on `feature/phase1-pack-seam-narration` (PR #26): ship the bundled `engineering-core` pack with eight markdown prompts, upgrade `/status` / `/flight` / `/doctor` / `/trace` to medium-density ANSI snapshots with pack/phase/validator/memory state, wire the narrator into the remaining ~35 `ui.notify` sites, and add interactive pack selection to `/init`.

**Architecture:** Three sequential tracks. Track A authors pack content (no extension.ts edits). Track B adds renderer helpers + dashboard projections + per-command rendering. Track C touches extension.ts broadly and runs last to avoid merge conflicts with A/B work.

**Tech Stack:** TypeScript, vitest, typebox, `yaml`, node:fs. Pi extension only — no new external deps.

**Spec reference:** `docs/superpowers/specs/2026-05-14-phase2-pack-content-ui-narration-design.md`.

---

## Working directory

All commands run against: `C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS`

Branch: `feature/phase1-pack-seam-narration` (continues PR #26).

---

## File structure

**New files:**

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

tests/unit/engineering-core-pack.test.ts
tests/unit/renderer-helpers.test.ts
tests/unit/snapshot-status.test.ts
tests/unit/narrator-coverage.test.ts
tests/integration/pack-selection-init.test.ts

docs/narration-tags.md
```

**Modified files:**

```
src/core/renderer.ts              — add 4 new helpers + medium-density layouts
src/core/projector.ts             — extend SessionDashboard with pack/phase/validator/memory
src/ccp/commands/status.ts        — wire new layout
src/ccp/commands/trace.ts         — wire new layout
src/ccp/commands/doctor.ts        — wire new layout
src/core/doctor.ts                — surface pack states + recovery hint
src/ccp/commands/init.ts          — pack-selection prompt
src/ccp/commands/init/prompts.ts  — new prompt helper
src/ccp/commands/init/pack-installer.ts  — accept --pack flag
src/pi/extension.ts               — narrator wiring (9 tag groups)
package.json                      — version bump 1.5.0 → 1.6.0
```

**Out of scope (audit constraints):** No new commands. No external pack distribution. No persistent TUI. No autonomous hooks. No validator path execution. No Matt Pocock skill content imported directly. No pack merging. No multi-runtime support. Existing `agent-os-core` pack untouched.

---

# Track A — engineering-core pack content (Tasks 1-5)

## Task 1: Scaffold engineering-core pack

**Files:**
- Create: `src/ccp/commands/init/packs/engineering-core/workflow-pack.yaml`
- Create: `src/ccp/commands/init/packs/engineering-core/README.md`

- [ ] **Step 1: Create the pack directory and manifest**

Create `src/ccp/commands/init/packs/engineering-core/workflow-pack.yaml`:

```yaml
workflow_pack_id: engineering-core
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
min_agent_os_version: "1.5.0"

grill:
  question_profile: doc_grounded
  max_questions: 8

plan:
  verification_profile: detected
artifact_root: ".agent-os/tasks"
task_id_pattern: "T-\\d{3}"
artifact_format: yaml

phases:
  - id: setup-workflow
    agent_os_command: /init
    allowed_predecessors: []
    produces: [WorkflowConfig]
    may_edit_source: false
    requires_approval: false
    validators: []

  - id: diagnose
    agent_os_command: /diagnose
    allowed_predecessors: [setup-workflow]
    produces: [DiagnosisRecord]
    may_edit_source: false
    requires_approval: false
    validators: [validate-artifact, validate-falsifiable-hypothesis, validate-no-stray-debug-tags]

  - id: grill
    agent_os_command: /grill
    allowed_predecessors: [setup-workflow, diagnose]
    produces: [GrillRecord]
    may_edit_source: false
    requires_approval: false
    validators: [validate-artifact]

  - id: write-plan
    agent_os_command: /plan
    allowed_predecessors: [grill]
    produces: [PlanArtifact]
    may_edit_source: false
    requires_approval: true
    validators: [validate-artifact, validate-plan-scope]

  - id: quick-task
    agent_os_command: /quick-task
    allowed_predecessors: [setup-workflow, diagnose, grill]
    produces: [QuickTaskRecord]
    may_edit_source: true
    requires_approval: true
    validators: [validate-artifact]
    escape_hatch: true

  - id: execute-plan
    agent_os_command: /run
    allowed_predecessors: [write-plan]
    produces: [ExecutionRecord]
    may_edit_source: true
    requires_approval: false
    validators: [validate-artifact, validate-plan-scope]

  - id: verify
    agent_os_command: /verify
    allowed_predecessors: [execute-plan]
    produces: [VerificationRecord]
    may_edit_source: false
    requires_approval: false
    validators: [validate-artifact, validate-criteria-coverage]

  - id: review
    agent_os_command: /review
    allowed_predecessors: [verify]
    produces: [ReviewRecord]
    may_edit_source: false
    requires_approval: true
    validators: [validate-artifact]

  - id: evaluate
    agent_os_command: /evaluate
    allowed_predecessors: [review]
    produces: [EvaluationRecord]
    may_edit_source: false
    requires_approval: true
    validators: [validate-artifact, validate-evaluation-gate]

  - id: remember
    agent_os_command: /remember
    allowed_predecessors: [evaluate, verify]
    produces: [KnowledgeCaptureRecord]
    may_edit_source: false
    requires_approval: false
    validators: []

validators:
  - id: validate-artifact
    path: validators/validate-artifact.ts
    mode: advisory
  - id: validate-plan-scope
    path: validators/validate-plan-scope.ts
    mode: advisory
  - id: validate-criteria-coverage
    path: validators/validate-criteria-coverage.ts
    mode: advisory
  - id: validate-evaluation-gate
    path: validators/validate-evaluation-gate.ts
    mode: advisory
  - id: validate-falsifiable-hypothesis
    path: validators/validate-falsifiable-hypothesis.ts
    mode: advisory
  - id: validate-no-stray-debug-tags
    path: validators/validate-no-stray-debug-tags.ts
    mode: advisory

prompts:
  diagnose:
    phases:
      - id: build-feedback-loop
        prompt: prompts/diagnose/01-build-feedback-loop.md
        exit_condition: feedback_loop_confirmed
      - id: reproduce
        prompt: prompts/diagnose/02-reproduce.md
        exit_condition: reproduction_confirmed
      - id: falsifiable-hypothesis
        prompt: prompts/diagnose/03-falsifiable-hypothesis.md
        exit_condition: hypothesis_stated
        validator: validate-falsifiable-hypothesis
      - id: instrument
        prompt: prompts/diagnose/04-instrument.md
        exit_condition: instrumentation_acknowledged
      - id: fix-at-seam
        prompt: prompts/diagnose/05-fix-at-seam.md
        exit_condition: fix_applied_or_no_seam_reported
      - id: cleanup
        prompt: prompts/diagnose/06-cleanup.md
        exit_condition: cleanup_done
        validator: validate-no-stray-debug-tags
  grill:
    intro: prompts/grill/intro.md
    question_packs:
      - prompts/grill/legacy-safe.md
```

- [ ] **Step 2: Create the pack README**

Create `src/ccp/commands/init/packs/engineering-core/README.md`:

```markdown
# engineering-core

A bundled workflow pack adding engineering-discipline workflows on top of the Agent OS governance baseline.

## What's in it

- **Phased `/diagnose`** — 6 sub-phases (build-feedback-loop, reproduce, falsifiable-hypothesis, instrument, fix-at-seam, cleanup) instead of the linear 5-question default. Forces falsifiable hypotheses and tagged-log discipline.
- **Doc-grounded `/grill`** — uses your repo's docs (README, AGENTS.md, CLAUDE.md, etc.) to anchor questions in real terminology.
- **Legacy-safe question pack** — opt-in supplementary grill questions about test seam, blast radius, and rollback path. Useful on unfamiliar codebases.
- **Extra validators** — `validate-falsifiable-hypothesis` enforces "if X then Y" structure in diagnosis hypotheses; `validate-no-stray-debug-tags` greps the repo for stray instrumentation tags after the cleanup phase.

## When to use this pack

- You're doing active engineering work (bug fixing, feature development, refactoring).
- You want guided diagnosis rather than free-form prompts.
- Your codebase is large enough that doc grounding helps anchor conversations.

## When to use agent-os-core instead

- You want the governance baseline only — phase gates, approvals, artifact persistence — without opinionated workflow content.
- You're scripting `/init` in a non-interactive setting and want the minimal install.

## Installing

Run `/init` and pick `engineering-core` when prompted, or `/init --pack engineering-core` to skip the prompt.

## Version

1.0.0 — bundled with Agent OS v1.6.0 and later.
```

- [ ] **Step 3: Verify the manifest loads**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/workflow-pack-loader.test.ts`

Expected: PASS (existing tests unchanged). The new pack is in `src/ccp/commands/init/packs/` (bundled source root) but no test references it yet — that's Task 5.

- [ ] **Step 4: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/init/packs/engineering-core/workflow-pack.yaml src/ccp/commands/init/packs/engineering-core/README.md
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(packs): scaffold engineering-core workflow-pack.yaml + README"
```

---

## Task 2: Author diagnose prompts 01-03

**Files:**
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/01-build-feedback-loop.md`
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/02-reproduce.md`
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/03-falsifiable-hypothesis.md`

Tone: pedagogical. 1-2 sentences of methodology context, then the concrete question.

- [ ] **Step 1: Write 01-build-feedback-loop.md**

```markdown
# Phase 1 of 6 — Build a feedback loop

The feedback loop is the single most important thing in diagnosis. Without a
reproducible signal, every change is a guess. A 30-second feedback loop turns
8 hours of debugging into 30 minutes.

Pick a mechanism, ranked best → last resort:

  1. Failing test — fastest, most precise. Use this if a test seam exists.
  2. `curl` or HTTP probe — for API bugs.
  3. CLI snapshot — record args/env, replay later.
  4. Playwright / headless browser — for UI bugs.
  5. Trace replay — for distributed-system or async bugs.
  6. Throwaway test harness — when no existing seam fits.
  7. Fuzz / property test — for input-shape bugs.
  8. Bisect harness — for regressions.
  9. HITL bash script — user clicks the button each time; last resort.

Type the mechanism you'll use. If none work for this bug, type `none` and
describe what's blocking. That blocker is itself the finding — record it
honestly rather than fake a loop.
```

- [ ] **Step 2: Write 02-reproduce.md**

```markdown
# Phase 2 of 6 — Reproduce

A bug you cannot reproduce is a bug you cannot fix. Reproduction must be
reliable (works every time) and minimal (smallest possible input/state).

State your minimal repro:
  - The exact command, request, or sequence of clicks.
  - The expected output vs. the actual output.
  - Any environment requirements (env vars, fixtures, state).

If your repro is more than ~5 lines, try to shrink it. A bug that takes a
3-step repro is 10× easier to fix than a bug that takes a 20-step repro.

When ready, paste the minimal repro. The exit-condition confirmation asks
whether this repro fires the bug reliably (yes / no).
```

- [ ] **Step 3: Write 03-falsifiable-hypothesis.md**

```markdown
# Phase 3 of 6 — Falsifiable hypothesis

A hypothesis without an "if … then …" clause is a guess. Falsifiability
separates diagnosis from speculation. You should be able to state, in one
sentence, what would prove your hypothesis wrong.

Bad hypothesis: "Probably a cache problem."
Good hypothesis: "If the cache TTL is too short, then setting `TTL=3600` and
running the repro should make the bug disappear."
Better: "If the cache invalidator fires on user logout, then logging out
between requests should make the bug disappear."

State at least one falsifiable hypothesis. Use the form:
  "If X is the cause, then changing Y will make the bug disappear."

Rank by likelihood (1 = most likely). Multiple hypotheses are fine — the
validator only requires that each one contains the "if … then …" clause.
```

- [ ] **Step 4: Verify all three files are < 10 KB and non-empty**

Run (PowerShell):
```
Get-ChildItem "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS\src\ccp\commands\init\packs\engineering-core\prompts\diagnose\0[123]-*.md" | ForEach-Object { "$($_.Name): $($_.Length) bytes" }
```

Expected: three files, each between 500 and 10240 bytes.

- [ ] **Step 5: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/init/packs/engineering-core/prompts/diagnose/01-build-feedback-loop.md src/ccp/commands/init/packs/engineering-core/prompts/diagnose/02-reproduce.md src/ccp/commands/init/packs/engineering-core/prompts/diagnose/03-falsifiable-hypothesis.md
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(packs): author diagnose prompts 01-03 (feedback-loop, reproduce, falsifiable-hypothesis)"
```

---

## Task 3: Author diagnose prompts 04-06

**Files:**
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/04-instrument.md`
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/05-fix-at-seam.md`
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/diagnose/06-cleanup.md`

- [ ] **Step 1: Write 04-instrument.md**

```markdown
# Phase 4 of 6 — Instrument

Tagged debug logs are the cheapest path to clarity in a confusing bug. Every
debug log added during this session must carry a unique short prefix so
cleanup is a grep, not a memory test.

Pick a unique tag. Recommended format: `[DEBUG-<4-hex>]`. Examples:
`[DEBUG-a4f2]`, `[DEBUG-1c3d]`, `[DEBUG-bug42]`.

Why a tag at all? Two reasons:
  - **Cleanup is a grep.** When you fix the bug, you grep the tag and remove
    every match. No "did I leave a `console.log` somewhere?"
  - **Confidentiality.** Stray debug output is a leak risk in shared logs,
    CI artifacts, and recorded sessions. A tag makes them findable.

Type the tag you'll use for this session. The cleanup phase (phase 6) will
grep the repo for it; any remaining matches will fail the validator.
```

- [ ] **Step 2: Write 05-fix-at-seam.md**

```markdown
# Phase 5 of 6 — Fix at the correct seam

A fix at the wrong seam is a future bug. The "correct seam" is the layer
where the bug is actually caused — not the layer where it's most visible.

Three options:

  1. **Fix at the seam.** Describe the change: where it lands (file + symbol),
     why this is the right layer, and what tests you added or will add.

  2. **Fix elsewhere, with reason.** Sometimes the right seam is out of reach
     (third-party library, frozen API, scope constraint). Describe the
     workaround AND the technical-debt note for the real fix.

  3. **No correct seam exists.** This is the honest output sometimes. If the
     architecture has no place for this fix, that's the finding. Type
     `no-seam` and describe the architectural gap. This becomes the input to
     a future `/improve-codebase-architecture`-style refactor — don't fake
     a fix just to close the task.

State the option you're choosing and the details for it.
```

- [ ] **Step 3: Write 06-cleanup.md**

```markdown
# Phase 6 of 6 — Cleanup

Stray debug tags are noise pollution and a confidentiality risk. The
`validate-no-stray-debug-tags` validator will grep the repo for the
instrumentation tag you set in phase 4. Any remaining matches will fail.

Cleanup checklist:
  - Remove every `[DEBUG-...]` (or whichever tag you used) log line.
  - Remove any commented-out debug code.
  - Remove any temporary feature flags or debug routes you added.
  - Confirm `grep -r "<your-tag>" .` returns nothing.
  - If you added a regression test in phase 5, confirm it still passes.

Type `done` when cleanup is complete. The validator will run; if it finds a
stray match it will report `file:line` for each.

If you intentionally left a tag in place (e.g., as a permanent named
checkpoint), rename it to something without `[DEBUG-` so it doesn't trip
the validator on future sessions.
```

- [ ] **Step 4: Verify all three files are < 10 KB**

Run (PowerShell):
```
Get-ChildItem "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS\src\ccp\commands\init\packs\engineering-core\prompts\diagnose\0[456]-*.md" | ForEach-Object { "$($_.Name): $($_.Length) bytes" }
```

Expected: three files, each between 500 and 10240 bytes.

- [ ] **Step 5: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/init/packs/engineering-core/prompts/diagnose/04-instrument.md src/ccp/commands/init/packs/engineering-core/prompts/diagnose/05-fix-at-seam.md src/ccp/commands/init/packs/engineering-core/prompts/diagnose/06-cleanup.md
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(packs): author diagnose prompts 04-06 (instrument, fix-at-seam, cleanup)"
```

---

## Task 4: Author grill prompts (intro + legacy-safe)

**Files:**
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/grill/intro.md`
- Create: `src/ccp/commands/init/packs/engineering-core/prompts/grill/legacy-safe.md`

- [ ] **Step 1: Write grill/intro.md**

```markdown
# Grill — methodology

Before we start the interview, three ground rules:

**One question at a time.** I'll ask, you answer, we move on. Don't try to
pre-empt a later question — the order matters because each answer changes
what I should ask next.

**Recommended answer per question.** I'll suggest what I think the right
answer is, based on the repo docs and code I can see. You override me freely
— the goal is to surface disagreement, not to railroad.

**Cross-reference with code.** If you tell me how something works, I'll
check it against the actual code. If your answer conflicts with what the
code does, I'll surface it as the next question rather than silently
accepting either side.

If you want to skip an entire branch of questions, type `skip`. If you're
done, type `done`. If you want to write a load-bearing decision to the
project glossary, type `glossary <term>: <definition>` and it'll go to
`.agent-os/glossary.md` for future sessions.
```

- [ ] **Step 2: Write grill/legacy-safe.md**

This file is parsed by `PackQuestionGenerator` — one question per `##` heading. Each H2 becomes a question in the legacy-safe supplementary pack.

```markdown
# Legacy-safe questions

Supplementary questions for unknown-test-stack repos or large legacy
codebases. These run before the standard functional questions in `/grill`.

## Where would a regression test for this change live?

Reason: if the answer is "nowhere" or "I don't know", we need to either
build a test seam first or fix at a different layer. Don't ship a change
to a codebase that can't catch the next regression.

## What's the blast radius if this change is wrong?

List the downstream components, services, or user flows that touch the
code path you're changing. The answer determines the risk tier and how
much verification effort is warranted.

## Can this be reverted in under 5 minutes?

If yes, document how (git revert this commit / toggle this flag / restart
this service). If no, the change is high-risk regardless of size — small
diffs to load-bearing code are still high-risk if they can't be undone fast.

## What does the existing code call this concept?

If the codebase already has a word for what you're working on, use it. If
the codebase has two competing words, surface the conflict. If you're
introducing a new word, justify why none of the existing ones fit. (This
question feeds the glossary.)

## What's the smallest change that would prove this works?

If your plan is "rewrite this module", what's the 20-line slice that
would demonstrate the approach? Tracer bullets first; full rewrite second.
```

- [ ] **Step 3: Verify file sizes**

Run (PowerShell):
```
Get-ChildItem "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS\src\ccp\commands\init\packs\engineering-core\prompts\grill\*.md" | ForEach-Object { "$($_.Name): $($_.Length) bytes" }
```

Expected: two files, each between 500 and 10240 bytes.

- [ ] **Step 4: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/init/packs/engineering-core/prompts/grill/intro.md src/ccp/commands/init/packs/engineering-core/prompts/grill/legacy-safe.md
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(packs): author engineering-core grill intro + legacy-safe question pack"
```

---

## Task 5: Test that engineering-core loads cleanly

**Files:**
- Test: `tests/unit/engineering-core-pack.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/engineering-core-pack.test.ts`:

```typescript
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';

/**
 * The engineering-core pack lives at src/ccp/commands/init/packs/engineering-core/.
 * To test loadWorkflowPacks against the bundled source, point it at the same
 * structure: { repoRoot }/.agent-os/packs/<packId>/.
 *
 * We use a small staged "repo" that symlinks (or copies via fixture path) the
 * bundled pack. The simplest portable approach: pass the parent of the bundled
 * packs dir as the .agent-os/packs/ root by structuring a fixture.
 *
 * Approach used here: read the manifest yaml directly with the pack loader by
 * constructing a temporary repoRoot whose .agent-os/packs/engineering-core/ is
 * a copy of the bundled pack.
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';

const BUNDLED_PACK_ROOT = join(
  import.meta.dirname ?? __dirname,
  '../../src/ccp/commands/init/packs/engineering-core',
);
const TMP = join(
  import.meta.dirname ?? __dirname,
  '../../node_modules/.test-tmp/engineering-core-pack',
);

function makeFixture(): string {
  const root = join(TMP, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const packsDir = join(root, '.agent-os', 'packs');
  const targetPackDir = join(packsDir, 'engineering-core');
  mkdirSync(packsDir, { recursive: true });
  cpSync(BUNDLED_PACK_ROOT, targetPackDir, { recursive: true });
  return root;
}

describe('engineering-core pack', () => {
  it('loads cleanly with no errors', () => {
    const root = makeFixture();
    try {
      const results = loadWorkflowPacks(root);
      expect(results).toHaveLength(1);
      const r = results[0];
      if (!r) throw new Error('no result');
      if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
      expect(r.manifest.workflow_pack_id).toBe('engineering-core');
      expect(r.manifest.version).toBe('1.0.0');
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch {}
    }
  });

  it('declares all 10 phases with correct ids', () => {
    const root = makeFixture();
    try {
      const results = loadWorkflowPacks(root);
      const r = results[0];
      if (!r || !r.ok) throw new Error('expected ok');
      const ids = r.manifest.phases.map((p) => p.id).sort();
      expect(ids).toEqual([
        'diagnose', 'evaluate', 'execute-plan', 'grill', 'quick-task',
        'remember', 'review', 'setup-workflow', 'verify', 'write-plan',
      ]);
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch {}
    }
  });

  it('declares both new validators (falsifiable-hypothesis + no-stray-debug-tags)', () => {
    const root = makeFixture();
    try {
      const results = loadWorkflowPacks(root);
      const r = results[0];
      if (!r || !r.ok) throw new Error('expected ok');
      const ids = r.manifest.validators.map((v) => v.id);
      expect(ids).toContain('validate-falsifiable-hypothesis');
      expect(ids).toContain('validate-no-stray-debug-tags');
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch {}
    }
  });

  it('loads all 6 diagnose prompts and 2 grill prompts with content', () => {
    const root = makeFixture();
    try {
      const results = loadWorkflowPacks(root);
      const r = results[0];
      if (!r || !r.ok) throw new Error('expected ok');
      const phases = r.manifest.prompts?.diagnose?.phases;
      expect(phases).toHaveLength(6);
      for (const p of phases!) {
        expect(p.prompt_content, `phase ${p.id} should have content`).toBeDefined();
        expect(p.prompt_content!.length).toBeGreaterThan(100);
      }
      expect(r.manifest.prompts?.grill?.intro?.content).toBeDefined();
      expect(r.manifest.prompts?.grill?.intro?.content!.length).toBeGreaterThan(100);
      expect(r.manifest.prompts?.grill?.question_packs).toHaveLength(1);
      expect(r.manifest.prompts?.grill?.question_packs?.[0]?.content!.length).toBeGreaterThan(100);
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch {}
    }
  });

  it('every prompt file is under 10 KB', () => {
    const promptFiles = [
      'prompts/diagnose/01-build-feedback-loop.md',
      'prompts/diagnose/02-reproduce.md',
      'prompts/diagnose/03-falsifiable-hypothesis.md',
      'prompts/diagnose/04-instrument.md',
      'prompts/diagnose/05-fix-at-seam.md',
      'prompts/diagnose/06-cleanup.md',
      'prompts/grill/intro.md',
      'prompts/grill/legacy-safe.md',
    ];
    for (const rel of promptFiles) {
      const full = join(BUNDLED_PACK_ROOT, rel);
      expect(existsSync(full), `${rel} must exist`).toBe(true);
      expect(statSync(full).size, `${rel} must be < 10KB`).toBeLessThan(10 * 1024);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/engineering-core-pack.test.ts`

Expected: 5/5 tests pass.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add tests/unit/engineering-core-pack.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "test(packs): verify engineering-core pack loads with all phases, validators, and prompts"
```

---

# Track B — Snapshot UI upgrades (Tasks 6-11)

## Task 6: Add renderPackBadge helper

**Files:**
- Modify: `src/core/renderer.ts`
- Test: `tests/unit/renderer-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer-helpers.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderPackBadge } from '../../src/core/renderer';

describe('renderPackBadge', () => {
  it('formats a current pack with checkmark', () => {
    const out = renderPackBadge('current', 'engineering-core', '1.0.0');
    expect(out).toMatch(/engineering-core@1\.0\.0/);
    expect(out).toMatch(/current/);
  });

  it('formats a stale pack with warning and bundled version', () => {
    const out = renderPackBadge('stale', 'engineering-core', '1.0.0', '1.1.0');
    expect(out).toMatch(/engineering-core@1\.0\.0/);
    expect(out).toMatch(/stale/);
    expect(out).toMatch(/1\.1\.0/);
  });

  it('formats a newer pack', () => {
    const out = renderPackBadge('newer', 'engineering-core', '1.2.0', '1.1.0');
    expect(out).toMatch(/newer/);
    expect(out).toMatch(/1\.1\.0/);
  });

  it('formats an unknown state', () => {
    const out = renderPackBadge('unknown', 'custom-pack', '0.5.0');
    expect(out).toMatch(/custom-pack@0\.5\.0/);
    expect(out).toMatch(/unknown/);
  });

  it('formats a modified-locally state', () => {
    const out = renderPackBadge('modified-locally', 'engineering-core', '1.0.0');
    expect(out).toMatch(/modified-locally/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: FAIL (`renderPackBadge` not exported).

- [ ] **Step 3: Implement the helper**

Edit `src/core/renderer.ts`. After the `healthLine` function (around line 52), add:

```typescript
// ── Pack badge ────────────────────────────────────────────────────────────────

export type PackVersionState = 'current' | 'stale' | 'newer' | 'unknown' | 'modified-locally';

const PACK_GLYPH: Record<PackVersionState, { ansi: string; ascii: string; color: string }> = {
  current:          { ansi: '✓', ascii: '[ok]', color: 'green' },
  stale:            { ansi: '⚠', ascii: '[!]',  color: 'yellow' },
  newer:            { ansi: '↑', ascii: '[^]',  color: 'cyan' },
  unknown:          { ansi: '?', ascii: '[?]',  color: 'yellow' },
  'modified-locally': { ansi: '~', ascii: '[~]', color: 'yellow' },
};

export function renderPackBadge(
  state: PackVersionState,
  packId: string,
  version: string,
  bundledVersion?: string,
): string {
  const g = PACK_GLYPH[state];
  const glyph = c(g.color, USE_ANSI ? g.ansi : g.ascii);
  const idPart = `${packId}@${version}`;
  let suffix = state;
  if (state === 'stale' && bundledVersion) suffix = `stale (bundled v${bundledVersion})`;
  if (state === 'newer' && bundledVersion) suffix = `newer than bundled v${bundledVersion}`;
  return `${idPart} ${glyph} ${suffix}`;
}
```

- [ ] **Step 4: Run test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: 5/5 pass.

- [ ] **Step 5: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/core/renderer.ts tests/unit/renderer-helpers.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(renderer): add renderPackBadge helper for /status pack state"
```

---

## Task 7: Add renderProgressBar helper

**Files:**
- Modify: `src/core/renderer.ts`
- Test: `tests/unit/renderer-helpers.test.ts` (extend)

- [ ] **Step 1: Extend the test file**

Append to `tests/unit/renderer-helpers.test.ts` (before the closing `});` of the outer describe block — or as a new top-level `describe`):

```typescript
import { renderProgressBar } from '../../src/core/renderer';

describe('renderProgressBar', () => {
  it('renders 4/8 with filled and empty cells', () => {
    const out = renderProgressBar(4, 8);
    expect(out).toMatch(/4\/8/);
    // 8 cells default width; 4 filled
    expect(out).toMatch(/\[[#█]{4}[-░]{4}\]/);
  });

  it('renders 0/8 fully empty', () => {
    const out = renderProgressBar(0, 8);
    expect(out).toMatch(/\[[-░]{8}\]/);
  });

  it('renders 8/8 fully filled', () => {
    const out = renderProgressBar(8, 8);
    expect(out).toMatch(/\[[#█]{8}\]/);
  });

  it('clamps current above total', () => {
    const out = renderProgressBar(20, 8);
    expect(out).toMatch(/8\/8/);
  });

  it('clamps current below zero', () => {
    const out = renderProgressBar(-3, 8);
    expect(out).toMatch(/0\/8/);
  });

  it('respects custom width', () => {
    const out = renderProgressBar(1, 4, 4);
    expect(out).toMatch(/\[[#█]{1}[-░]{3}\]/);
  });
});
```

(The existing `renderPackBadge` import is reused; just add the new import alongside.)

- [ ] **Step 2: Run to fail**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: 5 pass (pack badge) + 6 fail (`renderProgressBar` not exported).

- [ ] **Step 3: Implement the helper**

In `src/core/renderer.ts`, after `renderPackBadge`, add:

```typescript
// ── Progress bar ──────────────────────────────────────────────────────────────

export function renderProgressBar(
  current: number,
  total: number,
  width: number = 8,
): string {
  const t = Math.max(1, total);
  const c0 = Math.max(0, Math.min(current, t));
  const cells = Math.max(1, width);
  const filled = Math.round((c0 / t) * cells);
  const empty = cells - filled;
  const filledChar = USE_ANSI ? '█' : '#';
  const emptyChar = USE_ANSI ? '░' : '-';
  return `${c0}/${t}  [${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
}
```

- [ ] **Step 4: Run test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: 11/11 pass.

- [ ] **Step 5: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/core/renderer.ts tests/unit/renderer-helpers.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(renderer): add renderProgressBar with width param and clamping"
```

---

## Task 8: Add renderValidatorSummary + renderMemoryState helpers

**Files:**
- Modify: `src/core/renderer.ts`
- Test: `tests/unit/renderer-helpers.test.ts` (extend)

- [ ] **Step 1: Extend the test file**

Append to `tests/unit/renderer-helpers.test.ts`:

```typescript
import { renderValidatorSummary, renderMemoryState } from '../../src/core/renderer';

describe('renderValidatorSummary', () => {
  it('aggregates pass/fail/warn counts', () => {
    const out = renderValidatorSummary([
      { ok: true },
      { ok: true },
      { ok: false, findings: [{ message: 'x' }] },
    ]);
    expect(out).toMatch(/✓ 2|\[ok\] 2/);
    expect(out).toMatch(/✗ 1|\[x\] 1/);
    expect(out).toMatch(/0/); // warn count
  });

  it('returns zero-state when no validators ran', () => {
    const out = renderValidatorSummary([]);
    expect(out).toMatch(/0/);
  });
});

describe('renderMemoryState', () => {
  it('uses singular for 1', () => {
    expect(renderMemoryState(1)).toMatch(/1 candidate pending/);
  });

  it('uses plural for >1', () => {
    expect(renderMemoryState(3)).toMatch(/3 candidates pending/);
  });

  it('returns zero state', () => {
    expect(renderMemoryState(0)).toMatch(/0 candidates pending/);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: helpers not exported, tests fail.

- [ ] **Step 3: Implement**

In `src/core/renderer.ts`, after `renderProgressBar`, add:

```typescript
// ── Validator summary ─────────────────────────────────────────────────────────

export interface ValidatorOutcome {
  ok: boolean;
  findings?: Array<{ message: string }>;
  /** Optional severity hint; defaults to 'fail' when !ok, 'pass' when ok */
  severity?: 'pass' | 'warn' | 'fail';
}

export function renderValidatorSummary(results: ValidatorOutcome[]): string {
  let pass = 0, fail = 0, warn = 0;
  for (const r of results) {
    const sev = r.severity ?? (r.ok ? 'pass' : 'fail');
    if (sev === 'pass') pass++;
    else if (sev === 'warn') warn++;
    else fail++;
  }
  const okGlyph = c('green', USE_ANSI ? '✓' : '[ok]');
  const failGlyph = c('red', USE_ANSI ? '✗' : '[x]');
  const warnGlyph = c('yellow', USE_ANSI ? '⚠' : '[!]');
  return `${okGlyph} ${pass}   ${failGlyph} ${fail}   ${warnGlyph} ${warn}`;
}

// ── Memory state ──────────────────────────────────────────────────────────────

export function renderMemoryState(pending: number): string {
  const n = Math.max(0, pending);
  const word = n === 1 ? 'candidate' : 'candidates';
  return `${n} ${word} pending${n > 0 ? ' approval' : ''}`;
}
```

- [ ] **Step 4: Run test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/core/renderer.ts tests/unit/renderer-helpers.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(renderer): add renderValidatorSummary and renderMemoryState helpers"
```

---

## Task 9: Extend SessionDashboard projection

**Files:**
- Modify: `src/core/projector.ts`

- [ ] **Step 1: Read the current SessionDashboard interface**

Use Read tool on `src/core/projector.ts` to find the `SessionDashboard` interface.

- [ ] **Step 2: Add four optional fields**

Locate the `SessionDashboard` interface and add four optional fields. The exact location is the end of the interface declaration. Add (preserving existing fields):

```typescript
export interface SessionDashboard {
  // ... all existing fields preserved ...

  // ── Phase 2 additive (medium-density snapshot) ─────────────────────────────
  active_pack?: {
    id: string;
    version: string;
    state: 'current' | 'stale' | 'newer' | 'unknown' | 'modified-locally';
    bundled_version?: string;
  };
  phase_progress?: {
    current: number;
    total: number;
    name: string;
  };
  validator_outcomes?: {
    passed: number;
    failed: number;
    warned: number;
  };
  memory_pending?: number;
}
```

- [ ] **Step 3: Update the projector to populate these fields from events**

In the same file, locate the function that builds the `SessionDashboard` from events (typically `projectDashboard` or `buildDashboardFromEvents`). Inside it, add population for the new fields:

```typescript
// Find the most recent WorkflowPackLoadedEvent and use its payload
for (const e of events.slice().reverse()) {
  if (e.type === 'WorkflowPackLoadedEvent') {
    const payload = e.payload as Record<string, unknown>;
    dashboard.active_pack = {
      id: String(payload.workflow_pack_id ?? ''),
      version: String(payload.version ?? ''),
      state: (payload.version_state as SessionDashboard['active_pack'] extends infer T ? (T extends { state: infer S } ? S : never) : never) ?? 'unknown',
      bundled_version: typeof payload.bundled_version === 'string' ? payload.bundled_version : undefined,
    };
    break;
  }
}

// Count validator outcomes from recent ValidatorFinishedEvent entries
let pass = 0, fail = 0, warn = 0;
for (const e of events) {
  if (e.type === 'ValidatorFinishedEvent') {
    const payload = e.payload as Record<string, unknown>;
    if (payload.ok === true) pass++;
    else if (payload.mode === 'blocking') fail++;
    else warn++;
  }
}
if (pass + fail + warn > 0) {
  dashboard.validator_outcomes = { passed: pass, failed: fail, warned: warn };
}

// memory_pending count (best-effort from MemoryCandidatePendingEvent and MemoryCandidateApprovedEvent / MemoryCandidateDeclinedEvent)
let pending = 0;
for (const e of events) {
  if (e.type === 'MemoryCandidatePendingEvent') pending++;
  else if (e.type === 'MemoryCandidateApprovedEvent' || e.type === 'MemoryCandidateDeclinedEvent') pending = Math.max(0, pending - 1);
}
dashboard.memory_pending = pending;

// phase_progress (only when active pack defines phases and we know which one we're in)
if (dashboard.active_pack && dashboard.current_state) {
  // The phase ordering comes from PhaseRegistry — keep this simple: count completed state transitions.
  // For phased diagnose, the sub-phase progress is captured separately by DIAGNOSE_SUB_PHASE_COMPLETED events (added in Phase 1).
  // For top-level state machine, compute progress as: number of completed transitions / total expected.
  // Skip this if no canonical ordering is known.
}
```

NOTE: this is a best-effort sketch. The exact event names depend on what `src/ccp/ccp-events.ts` and `src/core/events.ts` actually emit. The implementer should:
- Use Grep to find the actual event type strings (e.g., `WorkflowPackLoadedEvent`, `ValidatorFinishedEvent` may have different names — search for "WorkflowPack" and "Validator" in events.ts).
- Adapt the population logic to match real event payloads.
- Where an event doesn't exist (e.g., `ValidatorFinishedEvent`), skip that field rather than fabricating events. (Adding a new event is Phase 3 work — out of scope.)
- The new fields are all optional, so partial population is acceptable.

If `ValidatorFinishedEvent` and `MemoryCandidate*Event` types don't exist yet, leave `validator_outcomes` and `memory_pending` unpopulated for now (the renderer will show "0" / "0 candidates pending" which is correct). Track A's pack loading already emits a "WorkflowPackLoadedEvent" via the Phase 1 narrator wiring (`extension.ts:218`), so `active_pack` should populate.

- [ ] **Step 4: Run full test suite to confirm no regression**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run`

Expected: no new test failures; all existing tests still pass.

- [ ] **Step 5: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/core/projector.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(projector): extend SessionDashboard with active_pack, phase_progress, validator_outcomes, memory_pending"
```

---

## Task 10: Upgrade /status to medium-density layout

**Files:**
- Modify: `src/core/renderer.ts` (extend `renderStatusToString`)
- Test: `tests/unit/snapshot-status.test.ts`

- [ ] **Step 1: Write the snapshot test**

Create `tests/unit/snapshot-status.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { SessionDashboard } from '../../src/core/projector';
import { renderStatusToString } from '../../src/core/renderer';

function baseDashboard(overrides: Partial<SessionDashboard> = {}): SessionDashboard {
  return {
    session_id: 's1',
    current_task_id: 'T-001',
    current_state: 'GRILLING',
    timeline: [],
    signals: {
      last_event_timestamp: new Date('2026-05-14T15:23:00.000Z').toISOString(),
      silent_failures: 0,
      loop_detected: false,
      repeated_queries: 0,
    },
    ...overrides,
  } as SessionDashboard;
}

const FIXED_NOW = new Date('2026-05-14T15:26:00.000Z').getTime();

describe('renderStatusToString — medium-density layout', () => {
  it('fresh task shows healthy + pack + phase + validators + memory + next', () => {
    const dash = baseDashboard({
      active_pack: { id: 'engineering-core', version: '1.0.0', state: 'current' },
      phase_progress: { current: 4, total: 8, name: 'grill' },
      validator_outcomes: { passed: 4, failed: 0, warned: 0 },
      memory_pending: 0,
    });
    // Force ANSI off for deterministic snapshot
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/T-001/);
      expect(out).toMatch(/GRILLING/);
      expect(out).toMatch(/engineering-core@1\.0\.0/);
      expect(out).toMatch(/current/);
      expect(out).toMatch(/4\/8/);
      expect(out).toMatch(/\[ok\] 4/);
      expect(out).toMatch(/\[x\] 0/);
      expect(out).toMatch(/0 candidates pending/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('stale pack shows stale badge with bundled version', () => {
    const dash = baseDashboard({
      active_pack: { id: 'engineering-core', version: '1.0.0', state: 'stale', bundled_version: '1.1.0' },
    });
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/stale/);
      expect(out).toMatch(/1\.1\.0/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('legacy dashboard with no active_pack still renders (backwards compat)', () => {
    const dash = baseDashboard();
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/T-001/);
      expect(out).toMatch(/GRILLING/);
      expect(out).not.toMatch(/engineering-core/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/snapshot-status.test.ts`

Expected: at least one test fails — current `renderStatusToString` doesn't emit pack/phase/validator/memory lines.

- [ ] **Step 3: Upgrade renderStatusToString**

Edit `src/core/renderer.ts`. Replace the existing `renderStatusToString` function (around lines 97-121) with:

```typescript
export function renderStatusToString(
  sessionId: string,
  dashboard: SessionDashboard,
  opts: RenderStatusOpts = {},
): string {
  const tail = opts.tail ?? 5;
  const nowMs = opts.nowMs ?? Date.now();
  const status = classifyHealth(dashboard, nowMs);
  const recent = filtered(dashboard.timeline).slice(-tail);
  const sig = dashboard.signals;

  const lines: string[] = [healthLine(status, dashboard)];

  // Medium-density data block (Phase 2 additions). Each line shows only if data is present.
  const dataLines: string[] = [];

  if (dashboard.active_pack) {
    const p = dashboard.active_pack;
    dataLines.push(`  Pack:        ${renderPackBadge(p.state, p.id, p.version, p.bundled_version)}`);
  }
  if (dashboard.phase_progress) {
    const pp = dashboard.phase_progress;
    dataLines.push(`  Phase:       ${renderProgressBar(pp.current, pp.total)}  (currently: ${pp.name})`);
  }
  if (dashboard.validator_outcomes) {
    const vo = dashboard.validator_outcomes;
    const summary = renderValidatorSummary([
      ...Array(vo.passed).fill({ ok: true }),
      ...Array(vo.failed).fill({ ok: false, findings: [] }),
      ...Array(vo.warned).fill({ ok: false, severity: 'warn' as const, findings: [] }),
    ]);
    dataLines.push(`  Validators:  ${summary}`);
  }
  if (typeof dashboard.memory_pending === 'number') {
    dataLines.push(`  Memory:      ${renderMemoryState(dashboard.memory_pending)}`);
  }
  dataLines.push(`  Last event:  ${ageLabel(sig.last_event_timestamp, nowMs)}`);

  if (dataLines.length > 0) {
    lines.push('');
    lines.push(...dataLines);
  }

  if (recent.length > 0) {
    lines.push('');
    lines.push(c('dim', '  Recent:'));
    for (const e of recent) lines.push(row(e));
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/snapshot-status.test.ts`

Expected: 3/3 pass.

- [ ] **Step 5: Verify no regression in existing renderer tests**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/renderer-helpers.test.ts tests/unit/snapshot-status.test.ts`

Expected: all pass.

- [ ] **Step 6: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 7: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/core/renderer.ts tests/unit/snapshot-status.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(status): upgrade /status to medium-density layout with pack/phase/validator/memory state"
```

---

## Task 11: Upgrade /doctor and /trace output

**Files:**
- Modify: `src/ccp/commands/doctor.ts`
- Modify: `src/core/doctor.ts` (only if needed to surface pack states)
- Modify: `src/core/renderer.ts` (extend `renderTraceToString` if needed)

- [ ] **Step 1: Read current /doctor output structure**

Use Read on `src/ccp/commands/doctor.ts` to see how `renderDoctorReport` is currently constructed.

- [ ] **Step 2: Upgrade /doctor rendering**

In `src/ccp/commands/doctor.ts`, find the report-rendering function (it currently produces text like `[X] check: pass`). Replace with the medium-density block format:

The exact diff depends on the current code. The structure to produce:

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

For each check, use the `[ok]/[x]/[!]` glyphs via the renderer pattern. For each pack row, call `renderPackBadge(state, id, version, bundledVersion?)` and prepend a 4-space indent. Mark non-active packs with `(inactive)`. Append `Hint:` lines for soft_fail cases.

Implementation sketch (adapt to actual file structure):

```typescript
import { renderPackBadge } from '../../core/renderer';
// ... existing imports

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = ['● Agent OS doctor', ''];

  for (const check of report.checks) {
    if (check.id === 'packs') {
      lines.push('  Packs:');
      for (const pack of check.packs ?? []) {
        const badge = renderPackBadge(pack.state, pack.id, pack.version, pack.bundled_version);
        const inactive = pack.active === false ? ' (inactive)' : '';
        lines.push(`    ${badge}${inactive}`);
      }
    } else {
      const glyph = check.status === 'pass' ? '✓' : check.status === 'soft_fail' ? '⚠' : '✗';
      lines.push(`  ${check.label.padEnd(15)} ${glyph} ${check.detail ?? ''}`);
    }
  }

  lines.push('', `  Status: ${report.overallStatus}`);
  if (report.hint) lines.push(`  Hint:   ${report.hint}`);

  return lines.join('\n');
}
```

NOTE: the implementer should adapt this to the actual shape of `DoctorReport` from `src/core/doctor.ts`. If the existing structure doesn't include per-pack arrays or `hint`, extend it minimally — see Task 9 pattern for adding optional fields.

- [ ] **Step 3: Upgrade /trace rendering**

Edit `src/core/renderer.ts`. The existing `renderTraceToString` is fine as-is BUT add pack badge to the header. Replace the first three lines of the function body (where it builds the `Session XXX ● HEALTHY` line) with:

```typescript
  const packLine = dashboard.active_pack
    ? `  ${renderPackBadge(dashboard.active_pack.state, dashboard.active_pack.id, dashboard.active_pack.version, dashboard.active_pack.bundled_version)}`
    : null;

  const lines: string[] = [
    bar,
    `  Session ${c('dim', sessionId.slice(0, 8))}  ${healthLine(status, dashboard)}`,
  ];
  if (packLine) lines.push(packLine);
  lines.push(bar);
```

- [ ] **Step 4: Add a snapshot test for /doctor and /trace**

Extend `tests/unit/snapshot-status.test.ts` (or create `tests/unit/snapshot-doctor.test.ts`) with:

```typescript
import { renderDoctorReport } from '../../src/ccp/commands/doctor';

describe('renderDoctorReport — medium-density', () => {
  it('fresh-install shows all checks pass', () => {
    process.env.NO_COLOR = '1';
    try {
      const report = {
        checks: [
          { id: 'constitution', label: 'Constitution', status: 'pass', detail: 'present' },
          { id: 'project', label: 'Project config', status: 'pass', detail: 'valid (project.yaml)' },
          { id: 'packs', label: 'Packs', status: 'pass', packs: [
            { id: 'engineering-core', version: '1.0.0', state: 'current', active: true },
          ]},
          { id: 'verify', label: 'Verification', status: 'pass', detail: 'pytest detected (pyproject.toml)' },
        ],
        overallStatus: 'pass',
      } as const;
      // @ts-expect-error simplified shape for the test
      const out = renderDoctorReport(report);
      expect(out).toMatch(/Agent OS doctor/);
      expect(out).toMatch(/engineering-core@1\.0\.0/);
      expect(out).toMatch(/Status: pass/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('stale pack shows recovery hint', () => {
    process.env.NO_COLOR = '1';
    try {
      const report = {
        checks: [
          { id: 'packs', label: 'Packs', status: 'soft_fail', packs: [
            { id: 'engineering-core', version: '1.0.0', state: 'stale', bundled_version: '1.1.0', active: true },
          ]},
        ],
        overallStatus: 'soft_fail',
        hint: 'run /init --upgrade --force',
      } as const;
      // @ts-expect-error simplified shape
      const out = renderDoctorReport(report);
      expect(out).toMatch(/stale/);
      expect(out).toMatch(/1\.1\.0/);
      expect(out).toMatch(/Status: soft_fail/);
      expect(out).toMatch(/Hint:.*init --upgrade --force/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/snapshot-status.test.ts`

Expected: 5/5 pass.

- [ ] **Step 6: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 7: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/doctor.ts src/core/doctor.ts src/core/renderer.ts tests/unit/snapshot-status.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(doctor,trace): medium-density output with pack badges and recovery hints"
```

---

# Track C — Pack selection UX + full narrator audit (Tasks 12-20)

## Task 12: Pack-selection UX in /init

**Files:**
- Modify: `src/ccp/commands/init.ts`
- Modify: `src/ccp/commands/init/prompts.ts`
- Modify: `src/ccp/commands/init/pack-installer.ts`
- Test: `tests/integration/pack-selection-init.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/pack-selection-init.test.ts`:

```typescript
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBundledPacks } from '../../src/ccp/commands/init/pack-installer';
import { listBundledPackIds } from '../../src/ccp/commands/init/pack-installer';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/pack-selection');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

describe('init pack selection', () => {
  it('lists both bundled packs', () => {
    const ids = listBundledPackIds();
    expect(ids).toContain('agent-os-core');
    expect(ids).toContain('engineering-core');
  });

  it('installs only the selected pack when packId is provided', () => {
    const targetRoot = join(TMP, `repo-${Date.now()}`, '.agent-os', 'packs');
    mkdirSync(targetRoot, { recursive: true });
    installBundledPacks({ targetRoot, packId: 'engineering-core', force: false });
    expect(existsSync(join(targetRoot, 'engineering-core', 'workflow-pack.yaml'))).toBe(true);
    expect(existsSync(join(targetRoot, 'agent-os-core', 'workflow-pack.yaml'))).toBe(false);
  });

  it('falls back to agent-os-core when packId is not provided (backwards compat)', () => {
    const targetRoot = join(TMP, `repo-${Date.now()}`, '.agent-os', 'packs');
    mkdirSync(targetRoot, { recursive: true });
    installBundledPacks({ targetRoot, force: false });
    expect(existsSync(join(targetRoot, 'agent-os-core', 'workflow-pack.yaml'))).toBe(true);
    expect(existsSync(join(targetRoot, 'engineering-core', 'workflow-pack.yaml'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/integration/pack-selection-init.test.ts`

Expected: fails — `listBundledPackIds` doesn't exist, `installBundledPacks` may not accept `packId`.

- [ ] **Step 3: Extend pack-installer**

Edit `src/ccp/commands/init/pack-installer.ts`. Add an exported `listBundledPackIds` function:

```typescript
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listBundledPackIds(sourceRoot: string = bundledPacksSourceRoot()): string[] {
  if (!existsSync(sourceRoot)) return [];
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
```

Update `installBundledPacks` to accept an optional `packId`:

```typescript
export interface InstallBundledPacksArgs {
  sourceRoot?: string;
  targetRoot: string;
  force?: boolean;
  packId?: string;  // NEW — when set, install only this pack; otherwise install agent-os-core (legacy default)
}

export function installBundledPacks(args: InstallBundledPacksArgs): void {
  const sourceRoot = args.sourceRoot ?? bundledPacksSourceRoot();
  const selected = args.packId ?? 'agent-os-core';
  // ... existing logic, but only iterate the selected pack
}
```

(Adapt to the existing code — the implementer should preserve current behavior when `packId` is undefined, and install only the named pack when it is set.)

- [ ] **Step 4: Add interactive prompt to init.ts**

Edit `src/ccp/commands/init.ts`. Before calling `installBundledPacks`, add a pack-selection step. If `args.packId` is explicitly set via CLI flag, use it. Otherwise, if more than one pack is available AND the run is interactive (TTY available + `ui.select` is callable), prompt:

```typescript
async function selectPack(args: InitArgs): Promise<string> {
  if (args.packId) return args.packId;

  const available = listBundledPackIds();
  if (available.length <= 1) return available[0] ?? 'agent-os-core';

  // Non-interactive fallback: pick agent-os-core
  if (!args.ctx?.hasUI) return 'agent-os-core';

  const choice = await args.ctx.ui.select(
    'Workflow pack to install:',
    available.map((id) => id === 'engineering-core'
      ? 'engineering-core (governance + diagnose/grill discipline)'
      : `${id} (governance baseline)`),
  );
  // Extract pack id from the choice label (first word)
  return choice.split(' ')[0] ?? 'agent-os-core';
}
```

Then in the main `init` flow, call `selectPack(args)` and pass the result to `installBundledPacks`.

Also extend the arg parser in `src/ccp/commands/init/args.ts` to accept `--pack <id>`:

```typescript
// In args.ts, add to the parser:
if (token === '--pack') {
  const v = tokens[++i];
  if (typeof v === 'string' && v) parsed.packId = v;
  continue;
}
```

And add `packId?: string` to the `InitArgs` interface.

- [ ] **Step 5: Run test**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/integration/pack-selection-init.test.ts`

Expected: 3/3 pass.

- [ ] **Step 6: Run all init tests to verify no regression**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/pack-installer.test.ts tests/integration/init.test.ts tests/integration/pack-selection-init.test.ts`

Expected: existing tests pass; new test passes. The existing init integration tests may need an explicit `packId: 'agent-os-core'` if they assume the old default — update fixtures as needed.

- [ ] **Step 7: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 8: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/ccp/commands/init.ts src/ccp/commands/init/prompts.ts src/ccp/commands/init/pack-installer.ts src/ccp/commands/init/args.ts tests/integration/pack-selection-init.test.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(init): pack-selection prompt for multi-pack bundles + --pack flag

- Adds listBundledPackIds export
- /init prompts when multiple packs are bundled (TTY only)
- --pack <id> CLI flag bypasses prompt
- Non-interactive fallback: agent-os-core (safe default)"
```

---

## Task 13: Narrate [phase] transitions

**Files:**
- Modify: `src/pi/extension.ts`

Wire `narrate('phase', ...)` around every `transitionTaskLifecycle` call result and every `setStatus`/state-machine boundary in `extension.ts`.

- [ ] **Step 1: Grep for transition sites**

Run: Grep `transitionTaskLifecycle\|setStatus\|current_state` in `src/pi/extension.ts` with `-n` flag. Identify ~12 sites where state changes happen.

- [ ] **Step 2: Add narration**

For each command handler that calls `transitionTaskLifecycle`, add immediately after the transition:

```typescript
ctx.ui.notify(narrate('phase', `${args.allowedFrom[0]} → ${args.to}`), 'info');
```

The exact wrapping depends on the command. For example, in `/grill`:

```typescript
const transitionResult = transitionTaskLifecycle({
  repoRoot: cwd,
  sessionId,
  taskId,
  allowedFrom: ['NEW_IDEA'],
  to: 'GRILLING',
  triggeredBy: '/grill',
});
ctx.ui.notify(narrate('phase', `NEW_IDEA → GRILLING`), 'info');
```

If multiple transitions happen in one handler, each gets its own narration line.

- [ ] **Step 3: Run tests**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

- [ ] **Step 4: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [phase] state-machine transitions across all command handlers"
```

---

## Task 14: Narrate [doc] detection

**Files:**
- Modify: `src/pi/extension.ts`

- [ ] **Step 1: Grep for doc-detection sites**

Run: Grep `detectDocs\|sourceDocs` in `src/pi/extension.ts`.

- [ ] **Step 2: Add narration after detection**

In `buildGrillGenerator` (around line 511-525, established in Phase 1), after `docs = detectDocs(cwd)`, add:

```typescript
if (docs.length > 0 && ctx.hasUI) {
  ctx.ui.notify(
    narrate('doc', `using ${docs.map((d) => d.rel).join(', ')} as grounding source${docs.length === 1 ? '' : 's'}`),
    'info',
  );
}
```

Any other doc-detection site (e.g., plan drafter consulting docs) gets the same treatment.

- [ ] **Step 3: Run tests + commit**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [doc] detection results in grill/plan handlers"
```

---

## Task 15: Narrate [step] and [memory]

**Files:**
- Modify: `src/pi/extension.ts`

- [ ] **Step 1: Narrate [step] in /run handler**

Grep for `runRun\|STEP_STARTED\|STEP_COMPLETED` in `src/pi/extension.ts`. Around the step-execution loop in `/run`, add:

```typescript
ctx.ui.notify(narrate('step', `${stepId}: ${stepTitle} (approval tier ${stepTier})`), 'info');
// ... after step completes ...
ctx.ui.notify(narrate('step', `${stepId} ${success ? 'completed' : 'failed'}`), success ? 'info' : 'error');
```

- [ ] **Step 2: Narrate [memory] in /remember handler**

Grep for `runRememberCommand\|MEMORY_CANDIDATE`. Around capture-proposal sites, add:

```typescript
ctx.ui.notify(narrate('memory', `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} pending approval`), 'info');
// ... after each approval ...
ctx.ui.notify(narrate('memory', `candidate ${id} approved`), 'info');
// ... or declined ...
ctx.ui.notify(narrate('memory', `candidate ${id} declined`), 'info');
```

- [ ] **Step 3: Run tests + commit**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [step] in /run and [memory] in /remember"
```

---

## Task 16: Narrate [plan] and [verify]

**Files:**
- Modify: `src/pi/extension.ts`

- [ ] **Step 1: Narrate [plan]**

In the `/plan` handler, after the plan drafter runs and detected test commands are known, add:

```typescript
if (draftedCommands.length > 0) {
  ctx.ui.notify(
    narrate('plan', `detected verification: ${draftedCommands[0].command} (${draftedCommands[0].source_file})`),
    'info',
  );
}
```

- [ ] **Step 2: Narrate [verify]**

In the `/verify` handler, before running each verification command, narrate:

```typescript
ctx.ui.notify(narrate('verify', `running ${cmd.command}`), 'info');
// ... after result ...
ctx.ui.notify(narrate('verify', `${cmd.command} → ${result.signal}`), result.passed ? 'info' : 'error');
```

- [ ] **Step 3: Run tests + commit**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [plan] detection and [verify] command runs"
```

---

## Task 17: Narrate [review] and [evaluate]

**Files:**
- Modify: `src/pi/extension.ts`

- [ ] **Step 1: Narrate [review]**

In `/review` handler, at the start: `ctx.ui.notify(narrate('review', 'awaiting human review'), 'info');`. After approval/rejection: `ctx.ui.notify(narrate('review', \`task ${decision}\`), 'info');`.

- [ ] **Step 2: Narrate [evaluate]**

In `/evaluate` handler, after the evaluation record is produced:

```typescript
ctx.ui.notify(
  narrate('evaluate', `outcome: ${record.task_outcome} (criteria=${record.criteria_satisfaction_rate})`),
  'info',
);
```

- [ ] **Step 3: Run tests + commit**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [review] and [evaluate] outcomes"
```

---

## Task 18: Narrate [doctor]

**Files:**
- Modify: `src/pi/extension.ts`

- [ ] **Step 1: Narrate each doctor check**

In the `/doctor` handler, when each check renders to the UI, also emit a narration line per check. Replace the existing loop that emits `ctx.ui.notify(...)` per check (around line 425-440 from Phase 1 audit) with:

```typescript
for (const check of report.checks) {
  ctx.ui.notify(narrate('doctor', `${check.label}: ${check.status}`), check.status === 'fail' ? 'error' : 'info');
}
ctx.ui.notify(narrate('doctor', `overall status: ${report.overallStatus}`), report.overallStatus === 'fail' ? 'error' : 'info');
```

- [ ] **Step 2: Run tests + commit**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test`

Expected: no new failures.

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add src/pi/extension.ts
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "feat(pi): narrate [doctor] check results and overall status"
```

---

## Task 19: Narration coverage test + narration-tags.md doc

**Files:**
- Test: `tests/unit/narrator-coverage.test.ts`
- Create: `docs/narration-tags.md`

- [ ] **Step 1: Write the coverage test**

Create `tests/unit/narrator-coverage.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXTENSION_PATH = join(import.meta.dirname ?? __dirname, '../../src/pi/extension.ts');

describe('narrator coverage in extension.ts', () => {
  const source = readFileSync(EXTENSION_PATH, 'utf-8');

  const REQUIRED_TAGS = [
    'pack', 'phase', 'doc', 'validator', 'step',
    'memory', 'plan', 'verify', 'review', 'evaluate',
    'doctor',
  ];

  for (const tag of REQUIRED_TAGS) {
    it(`emits at least one narrate('${tag}', ...) call`, () => {
      const pattern = new RegExp(`narrate\\(\\s*['"]${tag}['"]`);
      expect(pattern.test(source), `[${tag}] tag must be wired into extension.ts`).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/narrator-coverage.test.ts`

Expected: 11/11 pass (all tags wired by Tasks 13-18).

If any tag fails — go back to the corresponding task and add the missing wiring.

- [ ] **Step 3: Write docs/narration-tags.md**

Create `docs/narration-tags.md`:

```markdown
# Narration tags

This file is the canonical reference for every narration tag emitted by Agent OS. The narrator module is at `src/core/narrator.ts`; wiring is in `src/pi/extension.ts`.

Format: `[tag] one-line human-readable message`.

## Tag inventory

| Tag | When emitted | Example output |
|---|---|---|
| `[pack]` | Pack load, ignore, load-failure, prompt warnings, version state | `[pack] engineering-core v1.0.0 loaded` |
| `[phase]` | Task-lifecycle state transitions | `[phase] NEW_IDEA → GRILLING` |
| `[doc]` | Doc-detector results consumed | `[doc] using AGENTS.md, CLAUDE.md as grounding sources` |
| `[validator]` | Validator pass/findings from `runValidatorsForPhase` | `[validator] validate-artifact passed` |
| `[step]` | Plan step start/complete/fail during `/run` | `[step] S-001: edit src/foo.ts (approval tier 2)` |
| `[memory]` | Memory candidate proposed/approved/declined | `[memory] 3 candidates pending approval` |
| `[plan]` | Plan-drafter detected verification command | `[plan] detected verification: pytest (pyproject.toml)` |
| `[verify]` | Verification command start/result | `[verify] running pytest — 12 passed, 0 failed` |
| `[review]` | Human-review boundaries | `[review] awaiting human review` |
| `[evaluate]` | Evaluation outcome | `[evaluate] outcome: PASS (criteria=1.0)` |
| `[doctor]` | Each doctor check result + overall status | `[doctor] Constitution: pass` |
| `[trace]` | Reserved for future use; not currently emitted | — |

## Where each tag is wired

| Tag | File:section |
|---|---|
| `[pack]` | `src/pi/extension.ts` `ensurePacksLoaded` (Phase 1, ~line 217-260) |
| `[phase]` | `src/pi/extension.ts` — all command handlers calling `transitionTaskLifecycle` |
| `[doc]` | `src/pi/extension.ts` `buildGrillGenerator` (~line 511) |
| `[validator]` | `src/pi/extension.ts` `runPackValidators` (Phase 1, ~line 300-360) |
| `[step]` | `src/pi/extension.ts` `/run` handler |
| `[memory]` | `src/pi/extension.ts` `/remember` handler |
| `[plan]` | `src/pi/extension.ts` `/plan` handler |
| `[verify]` | `src/pi/extension.ts` `/verify` handler |
| `[review]` | `src/pi/extension.ts` `/review` handler |
| `[evaluate]` | `src/pi/extension.ts` `/evaluate` handler |
| `[doctor]` | `src/pi/extension.ts` `/doctor` handler |

## Adding a new tag

1. Add the tag to `NarrationTag` and `ALLOWED_TAGS` in `src/core/narrator.ts`.
2. Add a row to the "Tag inventory" table above.
3. Add a test case in `tests/unit/narrator-coverage.test.ts`.
4. Wire the tag at the appropriate site in `extension.ts` (or wherever else it belongs).
```

- [ ] **Step 4: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add tests/unit/narrator-coverage.test.ts docs/narration-tags.md
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "test(narrator): coverage check for all required tags; add narration-tags.md reference"
```

---

## Task 20: Final verification + version bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

Open `package.json`. Change `"version": "1.5.0"` to `"version": "1.6.0"`.

- [ ] **Step 2: Sync lockfile**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm install --package-lock-only --silent`

- [ ] **Step 3: Run the full Phase 2 test suite**

Run:
```
cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx vitest run tests/unit/engineering-core-pack.test.ts tests/unit/renderer-helpers.test.ts tests/unit/snapshot-status.test.ts tests/unit/narrator-coverage.test.ts tests/integration/pack-selection-init.test.ts
```

Expected: all Phase 2 test files pass; total ~30 new tests pass.

- [ ] **Step 4: Run full suite**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npm test 2>&1 | Select-Object -Last 10`

Expected: all Phase 1 + Phase 2 tests pass. Pre-existing Windows failures (`doc-detector`, `test-command-detector`, etc.) unchanged.

- [ ] **Step 5: Verify TS**

Run: `cd "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" add package.json package-lock.json
git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" commit -m "chore: bump version to 1.6.0 for Phase 2 (engineering-core + snapshot UI + full narrator)"
```

- [ ] **Step 7: Push and let PR #26 update**

Run: `git -C "C:\Users\agnivad\OneDrive - Microsoft\Agniva\starter\Agent_OS" push`

PR #26 auto-updates with the new commits. After push, update the PR title and body to reflect Phase 1+2 scope (this is done outside the plan — see report at end).

---

## Self-Review Checklist (executor: skim before declaring done)

**Spec coverage:**
- [ ] §4 Track A pack content → Tasks 1-5 ✓
- [ ] §5 Track B snapshot UI → Tasks 6-11 ✓
- [ ] §6 Track C pack-selection + narrator audit → Tasks 12-19 ✓
- [ ] §6.3 narration-tags.md → Task 19 ✓
- [ ] §7 test strategy → distributed across tasks ✓
- [ ] §11 acceptance criteria — verified by tests in Task 20 ✓

**Placeholder scan:** none — every prompt body, every code listing, every commit message is complete.

**Type consistency:**
- `PackVersionState` defined in Task 6 (`renderer.ts`), used in Task 9 (`projector.ts`) and Task 11 (`doctor.ts`).
- `ValidatorOutcome` defined in Task 8, used in Task 10's `renderStatusToString`.
- `SessionDashboard` extensions in Task 9 consumed by `renderStatusToString` in Task 10 and `renderTraceToString` in Task 11.
- `NarrationTag` defined in Phase 1; the coverage test in Task 19 enumerates all 11 emitted tags. `[trace]` is reserved but not wired — acceptable.

**Non-goals respected (all from spec §10):**
- No new commands. ✓
- No external pack distribution. ✓
- No persistent TUI. ✓
- No autonomous hooks. ✓
- No validator path execution. ✓
- No Matt Pocock skill content imported directly — prompts authored fresh. ✓
- No pack merging. ✓
- `agent-os-core` untouched. ✓

**Risks acknowledged (from spec §9):**
- ANSI snapshot brittleness — mitigated by `NO_COLOR=1` in snapshot tests.
- `extension.ts` growth — flagged in spec, acceptable for v1.6.0.
- `/init` non-interactive breakage — mitigated by `--pack` flag.
- Snapshot golden drift — mitigated by final-state-only snapshot scope.
- Pre-existing Windows test failures — unchanged.

**Total task count:** 20 (Track A: 5, Track B: 6, Track C: 9).
**Estimated new tests:** ~30.
**Estimated commits:** 20 task commits + version-bump commit = 21 commits on top of the existing 13 in PR #26.
