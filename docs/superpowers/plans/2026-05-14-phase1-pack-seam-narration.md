# Phase 1: Pack Seam Deepening + Auto-Narration Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the workflow-pack seam with read-only prompt content support, turn `/diagnose` into an opt-in phased loop, add two new built-in validators, and lay a structured narration baseline so every system action is visible in the terminal.

**Architecture:** Two parallel tracks within one shippable unit (Agent_OS v1.5.0). Track B (narrator) ships first because Track A uses it. Track A is additive: a new optional `prompts` field on the pack manifest, additive fields on `DiagnosisRecord`, two new built-in validator IDs, and opt-in phased flow in `runDiagnose`. Existing `agent-os-core` pack (no `prompts`) must keep working unchanged.

**Tech Stack:** TypeScript, vitest, `yaml` parser, typebox for artifact schemas, node:fs.

**Spec reference:** `docs/2026-05-14-skill-pack-architecture-audit.md` §10 Phase 1.

---

## File Structure

**New files (created in this plan):**
- `src/core/narrator.ts` — single source of truth for `[tag] message` formatting; pure function, no I/O.
- `tests/unit/core/narrator.test.ts` — narrator unit tests.
- `tests/unit/pack-loader-prompts.test.ts` — pack-loader prompts-field tests (kept separate to avoid bloating the existing `workflow-pack-loader.test.ts`).
- `tests/unit/validate-falsifiable-hypothesis.test.ts` — new validator tests.
- `tests/unit/validate-no-stray-debug-tags.test.ts` — new validator tests.
- `tests/unit/diagnose-phased.test.ts` — phased-diagnose flow tests.

**Modified files:**
- `src/core/workflow-pack-loader.ts` — add `PromptsConfig` interface; parse + validate; bound prompt file size; UTF-8 only; size_limits enforced.
- `src/ccp/artifacts/diagnosis-record.ts` — add optional fields `phase`, `hypotheses`, `feedback_loop`, `instrumentation_tag`; schema_version bump.
- `src/core/validator-runner.ts` — register two new built-in validators.
- `src/ccp/commands/diagnose.ts` — branch: if active pack declares `prompts.diagnose.phases`, run phased loop; otherwise existing flow.
- `src/pi/extension.ts` — wire narrator into pack-load, pack-stale, and validator notifications (selective wiring, not the full 40+ call-site audit — that is Phase 2).
- `package.json` — bump version to `1.5.0`.

**Out of scope (must not touch in this plan):**
- `/status`, `/flight`, `/doctor`, `/trace` rendering (those are Phase 2).
- `engineering-core` pack content (that is Phase 2).
- Pack-driven artifact schemas, command registration, or UI control (all explicitly deferred).
- Setup-workflow phase, LLM planning, validator path execution, multi-pack runtime (all per audit constraints).

---

## Task 1: Create the narrator module

**Files:**
- Create: `src/core/narrator.ts`
- Test: `tests/unit/core/narrator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/narrator.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { narrate, type NarrationTag } from '../../../src/core/narrator';

describe('narrator.narrate', () => {
  it('formats a tagged line as "[tag] message"', () => {
    expect(narrate('pack', 'agent-os-core v1.2.0 loaded')).toBe('[pack] agent-os-core v1.2.0 loaded');
  });

  it('trims trailing whitespace and newlines', () => {
    expect(narrate('phase', 'GRILLING  \n')).toBe('[phase] GRILLING');
  });

  it('collapses internal newlines to spaces — narration is single-line', () => {
    expect(narrate('validator', 'line1\nline2')).toBe('[validator] line1 line2');
  });

  it('throws on empty message', () => {
    expect(() => narrate('pack', '')).toThrow(/non-empty/);
    expect(() => narrate('pack', '   ')).toThrow(/non-empty/);
  });

  it('throws on unknown tag at compile time — runtime guard for non-TS callers', () => {
    // TypeScript should reject this; runtime guard exists for callers from non-TS code paths
    // @ts-expect-error — testing runtime guard
    expect(() => narrate('not-a-tag', 'x')).toThrow(/unknown tag/);
  });

  it('accepts every defined tag', () => {
    const tags: NarrationTag[] = [
      'pack', 'phase', 'doc', 'validator', 'step',
      'memory', 'plan', 'verify', 'review', 'evaluate',
      'doctor', 'trace',
    ];
    for (const t of tags) {
      expect(narrate(t, 'x')).toBe(`[${t}] x`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Agent_OS && npx vitest run tests/unit/core/narrator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/narrator.ts`:

```typescript
/**
 * Narrator — single source of truth for terminal narration lines.
 * Pure function. No I/O. Callers route output through ui.notify.
 *
 * Format: "[tag] message" — single line, trimmed, internal newlines collapsed.
 */

export type NarrationTag =
  | 'pack'
  | 'phase'
  | 'doc'
  | 'validator'
  | 'step'
  | 'memory'
  | 'plan'
  | 'verify'
  | 'review'
  | 'evaluate'
  | 'doctor'
  | 'trace';

const ALLOWED_TAGS: ReadonlySet<NarrationTag> = new Set<NarrationTag>([
  'pack', 'phase', 'doc', 'validator', 'step',
  'memory', 'plan', 'verify', 'review', 'evaluate',
  'doctor', 'trace',
]);

export function narrate(tag: NarrationTag, message: string): string {
  if (!ALLOWED_TAGS.has(tag)) {
    throw new Error(`narrator: unknown tag "${tag}"`);
  }
  const normalized = message.replace(/\s*\n\s*/g, ' ').trim();
  if (!normalized) {
    throw new Error('narrator: message must be non-empty');
  }
  return `[${tag}] ${normalized}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Agent_OS && npx vitest run tests/unit/core/narrator.test.ts`
Expected: PASS (6 tests pass).

- [ ] **Step 5: Commit**

```bash
cd Agent_OS
git add src/core/narrator.ts tests/unit/core/narrator.test.ts
git commit -m "feat(core): add narrator module for tagged terminal narration"
```

---

## Task 2: Extend pack manifest with optional `prompts` field

**Files:**
- Modify: `src/core/workflow-pack-loader.ts`
- Test: `tests/unit/pack-loader-prompts.test.ts`

This task adds the read-only data seam the audit identifies as the smallest valuable deepening. Packs gain an optional `prompts:` block that names markdown files inside the pack directory. The loader reads, validates UTF-8, enforces size bounds (10KB/file, 200KB/total), and treats missing files as soft-fail warnings, not load failures.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pack-loader-prompts.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/pack-loader-prompts');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makePack(name: string, yaml: string, prompts: Record<string, string | Buffer> = {}): string {
  const root = join(TMP, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const dir = join(root, '.agent-os', 'packs', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow-pack.yaml'), yaml, 'utf-8');
  for (const [rel, content] of Object.entries(prompts)) {
    const fullPath = join(dir, rel);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return root;
}

const BASE_YAML = `
workflow_pack_id: prompts-pack
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
phases:
  - id: diagnose
    agent_os_command: /diagnose
    allowed_predecessors: []
    produces: [DiagnosisRecord]
    may_edit_source: false
    requires_approval: false
    validators: []
validators: []
`;

describe('pack loader — prompts field', () => {
  it('loads a pack with no prompts field — backwards compat', () => {
    const root = makePack('p', BASE_YAML);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok');
    expect(r.manifest.prompts).toBeUndefined();
    expect(r.manifest.prompt_warnings).toEqual([]);
  });

  it('loads a pack with a present prompt file', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/01-reproduce.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml, {
      'prompts/diagnose/01-reproduce.md': '# Reproduce\nDescribe the minimal repro.',
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.id).toBe('reproduce');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.prompt_content).toContain('Describe the minimal repro');
    expect(r.manifest.prompt_warnings).toEqual([]);
  });

  it('emits a soft-fail warning when a referenced prompt file is missing', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/missing.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml); // no files written
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok — missing prompts are soft-fail, not load failure');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.prompt_content).toBeUndefined();
    expect(r.manifest.prompt_warnings.some((w) => w.includes('missing.md'))).toBe(true);
  });

  it('rejects a prompt file larger than 10KB', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/big.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml, {
      'prompts/diagnose/big.md': 'x'.repeat(10 * 1024 + 1),
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (r?.ok) throw new Error('expected ok:false for oversized prompt');
    expect(r.error).toMatch(/exceeds 10KB|too large/i);
  });

  it('rejects total prompt bytes over 200KB', () => {
    const phases = Array.from({ length: 25 }, (_, i) =>
      `      - id: p${i}\n        prompt: prompts/p${i}.md\n        exit_condition: ec${i}\n`).join('');
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
${phases}`;
    const prompts: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      prompts[`prompts/p${i}.md`] = 'y'.repeat(9 * 1024); // 25 × 9KB = 225KB total
    }
    const root = makePack('p', yaml, prompts);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (r?.ok) throw new Error('expected ok:false for oversized total');
    expect(r.error).toMatch(/total.*200KB|budget/i);
  });

  it('rejects a prompt file that is not valid UTF-8', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/bad.md
        exit_condition: ec
`;
    // 0xFF 0xFE is not valid UTF-8 outside BOM context; explicitly invalid mid-byte sequence:
    const root = makePack('p', yaml, {
      'prompts/diagnose/bad.md': Buffer.from([0xc3, 0x28]), // invalid UTF-8 sequence
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (r?.ok) throw new Error('expected ok:false for non-UTF-8');
    expect(r.error).toMatch(/UTF-8/i);
  });

  it('rejects a prompt that escapes the pack directory via ..', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: ../escape.md
        exit_condition: ec
`;
    const root = makePack('p', yaml, { 'escape.md': 'pwned' });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (r?.ok) throw new Error('expected ok:false for path escape');
    expect(r.error).toMatch(/outside pack directory|invalid path/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Agent_OS && npx vitest run tests/unit/pack-loader-prompts.test.ts`
Expected: FAIL — `WorkflowPackManifest` has no `prompts` field; tests don't compile or fail at runtime.

- [ ] **Step 3: Extend the manifest interface and loader**

Edit `src/core/workflow-pack-loader.ts`:

After the `PlanConfig` interface (currently around line 27-29), add:

```typescript
export interface PromptPhaseDefinition {
  id: string;
  prompt: string;          // relative path inside pack directory
  exit_condition: string;  // named flag set in artifact when sub-phase completes
  prompt_content?: string; // populated by loader after reading file
  validator?: string;      // optional validator ID to run on sub-phase exit
}

export interface PromptsDiagnoseConfig {
  phases?: PromptPhaseDefinition[];
}

export interface PromptsGrillConfig {
  intro?: { path: string; content?: string };
  question_packs?: Array<{ path: string; content?: string }>;
}

export interface PromptsConfig {
  diagnose?: PromptsDiagnoseConfig;
  grill?: PromptsGrillConfig;
}
```

Modify the `WorkflowPackManifest` interface (around line 31-44) to add two fields:

```typescript
export interface WorkflowPackManifest {
  workflow_pack_id: string;
  version: string;
  schema_version: string;
  runtime_target: string;
  min_agent_os_version: string;
  artifact_root: string;
  task_id_pattern: string;
  artifact_format: 'yaml' | 'json';
  phases: PhaseDefinition[];
  validators: ValidatorDefinition[];
  grill?: GrillConfig;
  plan?: PlanConfig;
  prompts?: PromptsConfig;        // NEW
  prompt_warnings: string[];      // NEW — non-fatal load warnings
}
```

At the top of the file add the additional imports needed:

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
```

Add a new helper after `parsePlanConfig` (after line 154):

```typescript
const PROMPT_FILE_MAX_BYTES = 10 * 1024;       // 10KB per file
const PROMPT_TOTAL_MAX_BYTES = 200 * 1024;     // 200KB total per pack

function isInsidePack(packDir: string, relativePath: string): boolean {
  if (isAbsolute(relativePath)) return false;
  const resolved = resolve(packDir, relativePath);
  const rel = relative(packDir, resolved);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

function readPromptFile(
  packDir: string,
  relPath: string,
  budget: { used: number },
): { content?: string; warning?: string } {
  if (!isInsidePack(packDir, relPath)) {
    throw new Error(`prompt path "${relPath}" is outside pack directory or invalid path`);
  }
  const fullPath = resolve(packDir, relPath);
  if (!existsSync(fullPath)) {
    return { warning: `prompt file not found: ${relPath}` };
  }
  const size = statSync(fullPath).size;
  if (size > PROMPT_FILE_MAX_BYTES) {
    throw new Error(`prompt file "${relPath}" (${size} bytes) exceeds 10KB per-file limit`);
  }
  if (budget.used + size > PROMPT_TOTAL_MAX_BYTES) {
    throw new Error(`total prompt bytes exceeds 200KB budget after including "${relPath}"`);
  }
  budget.used += size;
  const buf = readFileSync(fullPath);
  // Validate UTF-8 by decoding strictly: TextDecoder with fatal:true throws on invalid sequences.
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(`prompt file "${relPath}" is not valid UTF-8`);
  }
  return { content };
}

function parsePromptsConfig(
  raw: unknown,
  packDir: string,
  warnings: string[],
): PromptsConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    throw new Error(`workflow-pack.yaml in ${packDir}: prompts must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const budget = { used: 0 };
  const config: PromptsConfig = {};

  // diagnose.phases
  if (p.diagnose && typeof p.diagnose === 'object') {
    const d = p.diagnose as Record<string, unknown>;
    if (d.phases !== undefined) {
      if (!Array.isArray(d.phases)) {
        throw new Error(`workflow-pack.yaml in ${packDir}: prompts.diagnose.phases must be an array`);
      }
      const phases: PromptPhaseDefinition[] = [];
      for (const ph of d.phases as Array<Record<string, unknown>>) {
        if (!ph || typeof ph !== 'object') {
          throw new Error('each prompts.diagnose.phases entry must be an object');
        }
        if (typeof ph.id !== 'string' || !ph.id) {
          throw new Error('each prompts.diagnose.phases entry must have a string id');
        }
        if (typeof ph.prompt !== 'string' || !ph.prompt) {
          throw new Error(`prompts.diagnose.phases[${ph.id}] must have a string prompt path`);
        }
        if (typeof ph.exit_condition !== 'string' || !ph.exit_condition) {
          throw new Error(`prompts.diagnose.phases[${ph.id}] must have a string exit_condition`);
        }
        const result = readPromptFile(packDir, ph.prompt, budget);
        if (result.warning) warnings.push(result.warning);
        phases.push({
          id: ph.id,
          prompt: ph.prompt,
          exit_condition: ph.exit_condition,
          prompt_content: result.content,
          validator: typeof ph.validator === 'string' ? ph.validator : undefined,
        });
      }
      config.diagnose = { phases };
    }
  }

  // grill.intro and grill.question_packs (lightweight; same patterns)
  if (p.grill && typeof p.grill === 'object') {
    const g = p.grill as Record<string, unknown>;
    const grillCfg: PromptsGrillConfig = {};
    if (typeof g.intro === 'string' && g.intro) {
      const r = readPromptFile(packDir, g.intro, budget);
      if (r.warning) warnings.push(r.warning);
      grillCfg.intro = { path: g.intro, content: r.content };
    }
    if (Array.isArray(g.question_packs)) {
      grillCfg.question_packs = [];
      for (const qp of g.question_packs as unknown[]) {
        if (typeof qp !== 'string' || !qp) {
          throw new Error('prompts.grill.question_packs entries must be non-empty strings');
        }
        const r = readPromptFile(packDir, qp, budget);
        if (r.warning) warnings.push(r.warning);
        grillCfg.question_packs.push({ path: qp, content: r.content });
      }
    }
    if (grillCfg.intro || grillCfg.question_packs) {
      config.grill = grillCfg;
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}
```

Modify `validateManifest` (return block at line 83-111) to include the new fields. Replace the return statement with:

```typescript
  const prompt_warnings: string[] = [];
  const prompts = parsePromptsConfig(r.prompts, packDir, prompt_warnings);

  return {
    workflow_pack_id: String(r.workflow_pack_id),
    version: String(r.version),
    schema_version: String(r.schema_version ?? '1.0.0'),
    runtime_target: String(r.runtime_target ?? 'pi'),
    min_agent_os_version: String(r.min_agent_os_version ?? '1.3.0'),
    artifact_root: String(r.artifact_root ?? '.agent-os/tasks'),
    task_id_pattern: String(r.task_id_pattern ?? 'T-\\d{3}'),
    artifact_format: (r.artifact_format === 'json' ? 'json' : 'yaml'),
    phases: (r.phases as Record<string, unknown>[]).map((p) => ({
      id: String(p.id),
      agent_os_command: String(p.agent_os_command ?? `/${p.id}`),
      allowed_predecessors: (p.allowed_predecessors as string[]),
      produces: Array.isArray(p.produces) ? (p.produces as string[]) : [],
      may_edit_source: Boolean(p.may_edit_source ?? false),
      requires_approval: Boolean(p.requires_approval ?? false),
      validators: Array.isArray(p.validators) ? (p.validators as string[]) : [],
      escape_hatch: Boolean(p.escape_hatch ?? false),
    })),
    validators: Array.isArray(r.validators)
      ? (r.validators as Record<string, unknown>[]).map((v) => ({
          id: String(v.id),
          path: String(v.path),
          mode: v.mode === 'blocking' ? 'blocking' : 'advisory',
        }))
      : [],
    grill: parseGrillConfig(r.grill, packDir),
    plan: parsePlanConfig(r.plan, packDir),
    prompts,
    prompt_warnings,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Agent_OS && npx vitest run tests/unit/pack-loader-prompts.test.ts`
Expected: PASS (7 tests pass).

- [ ] **Step 5: Run full pack-loader test suite to verify backwards compat**

Run: `cd Agent_OS && npx vitest run tests/unit/workflow-pack-loader.test.ts`
Expected: PASS (existing tests unchanged). One new property `prompt_warnings: []` is now present on all manifests but existing tests don't assert on its absence.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd Agent_OS && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd Agent_OS
git add src/core/workflow-pack-loader.ts tests/unit/pack-loader-prompts.test.ts
git commit -m "feat(core): add optional prompts field to workflow pack manifest

- Adds PromptsConfig with diagnose.phases and grill.intro/question_packs
- Size-bounded (10KB/file, 200KB total per pack)
- UTF-8 strictly validated; path escape rejected
- Missing prompt files are soft-fail (prompt_warnings), not load failures
- agent-os-core (no prompts) unchanged — backwards compatible"
```

---

## Task 3: Extend DiagnosisRecord with additive fields

**Files:**
- Modify: `src/ccp/artifacts/diagnosis-record.ts`
- Test: extend existing diagnose tests (none currently exist for this artifact; we add coverage in Task 6).

Additive only. Schema version bump. Existing diagnose flow continues to write the legacy fields; phased flow writes the new ones.

- [ ] **Step 1: Read current schema**

Already inspected. Current shape has: `bug_summary`, `reported_behavior`, `expected_behavior`, `minimal_case`, `suspected_root_cause`, `confidence`, `decision`, `open_blockers`.

- [ ] **Step 2: Extend the schema**

Replace `src/ccp/artifacts/diagnosis-record.ts` with:

```typescript
import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

// A single recorded sub-phase outcome (phased /diagnose flow).
export const DiagnosePhaseRecord = Type.Object({
  id: Type.String(),
  exit_condition: Type.String(),
  satisfied: Type.Boolean(),
  user_note: Type.Optional(Type.String()),
});
export type DiagnosePhaseRecord = Static<typeof DiagnosePhaseRecord>;

export const FalsifiableHypothesis = Type.Object({
  id: Type.String(),
  statement: Type.String(),  // expected to contain "if … then …"
  rank: Type.Number(),
});
export type FalsifiableHypothesis = Static<typeof FalsifiableHypothesis>;

export const DiagnosisRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('DiagnosisRecord'),
    bug_summary: Type.String(),
    reported_behavior: Type.String(),
    expected_behavior: Type.String(),
    minimal_case: Type.String(),
    suspected_root_cause: Type.String(),
    confidence: Type.Union([
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high'),
    ]),
    decision: Type.Union([Type.Literal('proceed'), Type.Literal('blocked')]),
    open_blockers: Type.Array(Type.String()),
    // ── additive Phase 1 fields (phased flow only) ─────────────────────────
    phases: Type.Optional(Type.Array(DiagnosePhaseRecord)),
    hypotheses: Type.Optional(Type.Array(FalsifiableHypothesis)),
    feedback_loop: Type.Optional(Type.String()),         // which mechanism (e.g., "curl", "failing test")
    instrumentation_tag: Type.Optional(Type.String()),   // e.g., "[DEBUG-a4f2]"
  }),
]);
export type DiagnosisRecord = Static<typeof DiagnosisRecord>;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd Agent_OS && npx tsc --noEmit`
Expected: 0 errors. Existing callers don't set the new optional fields and continue to compile.

- [ ] **Step 4: Run full test suite**

Run: `cd Agent_OS && npx vitest run`
Expected: all existing tests pass (491 + new ones from Tasks 1-2). Schema is purely additive.

- [ ] **Step 5: Commit**

```bash
cd Agent_OS
git add src/ccp/artifacts/diagnosis-record.ts
git commit -m "feat(artifacts): add optional phases/hypotheses/feedback_loop/instrumentation_tag fields to DiagnosisRecord"
```

---

## Task 4: Add `validate-falsifiable-hypothesis` validator

**Files:**
- Modify: `src/core/validator-runner.ts`
- Test: `tests/unit/validate-falsifiable-hypothesis.test.ts`

A new built-in validator. Reads a `DiagnosisRecord` artifact; passes if every hypothesis statement contains a falsifiable "if … then …" clause (case-insensitive). Otherwise fails with per-hypothesis findings.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/validate-falsifiable-hypothesis.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runBuiltinValidator } from '../../src/core/validator-runner';

const ctx = { taskDir: '/tmp', taskId: 'T-001' };

const BASE = {
  artifact_id: 'a1',
  task_id: 'T-001',
  artifact_type: 'DiagnosisRecord',
  schema_version: 1,
  created_at: '2026-05-14T10:00:00.000Z',
  bug_summary: 'x',
  reported_behavior: 'x',
  expected_behavior: 'x',
  minimal_case: 'x',
  suspected_root_cause: 'x',
  confidence: 'medium',
  decision: 'proceed',
  open_blockers: [],
};

describe('validate-falsifiable-hypothesis', () => {
  it('skips non-DiagnosisRecord artifacts', () => {
    const result = runBuiltinValidator(
      'validate-falsifiable-hypothesis',
      { ...BASE, artifact_type: 'PlanArtifact' },
      ctx,
    );
    expect(result?.ok).toBe(true);
  });

  it('passes a DiagnosisRecord with no hypotheses (legacy flow)', () => {
    const result = runBuiltinValidator('validate-falsifiable-hypothesis', BASE, ctx);
    expect(result?.ok).toBe(true);
  });

  it('passes a hypothesis with explicit "if … then …" clause', () => {
    const artifact = {
      ...BASE,
      hypotheses: [
        { id: 'H1', statement: 'If the cache TTL is too long, then stale data should appear when we clear the cache.', rank: 1 },
      ],
    };
    const result = runBuiltinValidator('validate-falsifiable-hypothesis', artifact, ctx);
    expect(result?.ok).toBe(true);
  });

  it('fails a hypothesis missing falsifiable structure', () => {
    const artifact = {
      ...BASE,
      hypotheses: [
        { id: 'H1', statement: 'Probably a cache problem.', rank: 1 },
      ],
    };
    const result = runBuiltinValidator('validate-falsifiable-hypothesis', artifact, ctx);
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.findings[0]?.field).toBe('hypotheses[0]');
    expect(result.findings[0]?.message).toMatch(/falsifiable|if.*then/i);
  });

  it('passes if-then in lowercase or with newline/space variations', () => {
    const cases = [
      'if foo, then bar',
      'IF the user is logged in THEN we should redirect',
      'if  the request includes header X\nthen the server returns 200',
    ];
    for (const statement of cases) {
      const result = runBuiltinValidator(
        'validate-falsifiable-hypothesis',
        { ...BASE, hypotheses: [{ id: 'H1', statement, rank: 1 }] },
        ctx,
      );
      expect(result?.ok, `case: ${statement}`).toBe(true);
    }
  });

  it('reports findings for every non-falsifiable hypothesis', () => {
    const artifact = {
      ...BASE,
      hypotheses: [
        { id: 'H1', statement: 'cache issue', rank: 1 },
        { id: 'H2', statement: 'if X then Y', rank: 2 },
        { id: 'H3', statement: 'flaky test', rank: 3 },
      ],
    };
    const result = runBuiltinValidator('validate-falsifiable-hypothesis', artifact, ctx);
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.field)).toEqual(['hypotheses[0]', 'hypotheses[2]']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Agent_OS && npx vitest run tests/unit/validate-falsifiable-hypothesis.test.ts`
Expected: FAIL — validator returns `null` for unknown ID.

- [ ] **Step 3: Implement the validator**

Edit `src/core/validator-runner.ts`. Add after `validateEvaluationGate` (around line 165, before the dispatcher comment):

```typescript
// ── validate-falsifiable-hypothesis ──────────────────────────────────────────
// Advisory: every hypothesis statement contains an "if X then Y" clause.
function validateFalsifiableHypothesis(artifact: Record<string, unknown>): ValidatorResult {
  if (artifact.artifact_type !== 'DiagnosisRecord') {
    return { ok: true }; // not a diagnosis — skip
  }
  const hypotheses = artifact.hypotheses;
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
    return { ok: true }; // no hypotheses provided (legacy flow) — skip
  }
  const IF_THEN = /\bif\b[\s\S]+?\bthen\b/i;
  const findings: ValidatorFinding[] = [];
  for (let i = 0; i < hypotheses.length; i++) {
    const h = hypotheses[i] as Record<string, unknown> | undefined;
    const statement = typeof h?.statement === 'string' ? h.statement : '';
    if (!IF_THEN.test(statement)) {
      findings.push({
        field: `hypotheses[${i}]`,
        message: `hypothesis "${statement.slice(0, 60)}" must be falsifiable: contain "if … then …" structure`,
      });
    }
  }
  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}
```

Then add the entry to `BUILT_IN_VALIDATORS` (around line 169-177):

```typescript
const BUILT_IN_VALIDATORS: Record<
  string,
  (artifact: Record<string, unknown>, ctx: ValidatorContext) => ValidatorResult
> = {
  'validate-artifact': (a) => validateArtifact(a),
  'validate-plan-scope': (a) => validatePlanScope(a),
  'validate-criteria-coverage': (a, ctx) => validateCriteriaCoverage(a, ctx),
  'validate-evaluation-gate': (a) => validateEvaluationGate(a),
  'validate-falsifiable-hypothesis': (a) => validateFalsifiableHypothesis(a),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Agent_OS && npx vitest run tests/unit/validate-falsifiable-hypothesis.test.ts`
Expected: PASS (6 tests pass).

- [ ] **Step 5: Commit**

```bash
cd Agent_OS
git add src/core/validator-runner.ts tests/unit/validate-falsifiable-hypothesis.test.ts
git commit -m "feat(validators): add validate-falsifiable-hypothesis built-in

Advisory validator. For DiagnosisRecord artifacts with hypotheses[],
each statement must contain 'if … then …' structure. Legacy flow
(no hypotheses) passes."
```

---

## Task 5: Add `validate-no-stray-debug-tags` validator

**Files:**
- Modify: `src/core/validator-runner.ts`
- Test: `tests/unit/validate-no-stray-debug-tags.test.ts`

Reads the `instrumentation_tag` field of a DiagnosisRecord (the prefix the user added when instrumenting, e.g., `[DEBUG-a4f2]`). Greps the repo for that prefix. If any matches remain, fails with file:line findings.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/validate-no-stray-debug-tags.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBuiltinValidator } from '../../src/core/validator-runner';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/no-stray-debug');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makeRepo(name: string, files: Record<string, string>): string {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

const BASE = {
  artifact_id: 'a1',
  task_id: 'T-001',
  artifact_type: 'DiagnosisRecord',
  schema_version: 1,
  created_at: '2026-05-14T10:00:00.000Z',
  bug_summary: 'x',
  reported_behavior: 'x',
  expected_behavior: 'x',
  minimal_case: 'x',
  suspected_root_cause: 'x',
  confidence: 'medium',
  decision: 'proceed',
  open_blockers: [],
};

describe('validate-no-stray-debug-tags', () => {
  it('skips non-DiagnosisRecord artifacts', () => {
    const repoDir = makeRepo('skip-non-diag', {});
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, artifact_type: 'PlanArtifact' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('passes when instrumentation_tag is missing (legacy flow)', () => {
    const repoDir = makeRepo('no-tag', { 'src/foo.ts': 'console.log("hi");' });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      BASE,
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('passes when no stray tags remain in the repo', () => {
    const repoDir = makeRepo('clean', {
      'src/foo.ts': 'console.log("regular log");',
      'src/bar.ts': 'function noop() {}',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('fails with file:line findings when a stray tag remains', () => {
    const repoDir = makeRepo('dirty', {
      'src/foo.ts': 'console.log("[DEBUG-a4f2] still here");',
      'src/clean.ts': 'console.log("nothing to see");',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toMatch(/src.foo\.ts:1/);
  });

  it('rejects a regex-special tag without escaping — tag is treated literally', () => {
    const repoDir = makeRepo('regex-special', {
      'src/foo.ts': 'console.log("[D.E.B*UG] literal");',
      'src/other.ts': 'console.log("DXEYBZUG something");',  // would match if . were wildcard
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[D.E.B*UG]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(false);
    if (result?.ok) return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toMatch(/src.foo\.ts/);
  });

  it('ignores common build/vcs directories', () => {
    const repoDir = makeRepo('ignored-dirs', {
      'src/clean.ts': 'console.log("ok");',
      'node_modules/dep/lib.js': 'console.log("[DEBUG-a4f2] in deps");',
      '.git/HEAD': '[DEBUG-a4f2] in git',
      'dist/bundle.js': '[DEBUG-a4f2] in dist',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Agent_OS && npx vitest run tests/unit/validate-no-stray-debug-tags.test.ts`
Expected: FAIL — validator does not exist; `ValidatorContext` does not have `repoRoot`.

- [ ] **Step 3: Extend `ValidatorContext` to include `repoRoot`**

Edit `src/core/validator-runner.ts`. The `ValidatorContext` interface (lines 15-18) currently is:

```typescript
export interface ValidatorContext {
  taskDir: string;
  taskId: string;
}
```

Change to:

```typescript
export interface ValidatorContext {
  taskDir: string;
  taskId: string;
  repoRoot?: string;  // optional; required by validators that scan the repo (e.g., validate-no-stray-debug-tags)
}
```

(Optional field — backwards compatible with existing callers and existing validators.)

- [ ] **Step 4: Implement the validator**

Edit `src/core/validator-runner.ts`. Add imports at the top (if not present):

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
```

Add the validator function after `validateFalsifiableHypothesis`:

```typescript
// ── validate-no-stray-debug-tags ─────────────────────────────────────────────
// Advisory: when DiagnosisRecord.instrumentation_tag is set, no stray matches
// should remain in the repo after the cleanup phase.

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.vitest', '.turbo', 'target', '__pycache__', '.venv', 'venv',
]);

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function* walkRepo(dir: string): Generator<string> {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      yield* walkRepo(join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

function validateNoStrayDebugTags(
  artifact: Record<string, unknown>,
  ctx: ValidatorContext,
): ValidatorResult {
  if (artifact.artifact_type !== 'DiagnosisRecord') {
    return { ok: true }; // not a diagnosis — skip
  }
  const tag = artifact.instrumentation_tag;
  if (typeof tag !== 'string' || !tag) {
    return { ok: true }; // legacy flow — skip
  }
  const repoRoot = ctx.repoRoot;
  if (!repoRoot || !existsSync(repoRoot)) {
    return { ok: true }; // no repo to scan — skip (best-effort)
  }
  const pattern = new RegExp(escapeForRegex(tag));
  const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip files > 2MB
  const findings: ValidatorFinding[] = [];

  for (const filePath of walkRepo(repoRoot)) {
    let size: number;
    try { size = statSync(filePath).size; } catch { continue; }
    if (size > MAX_FILE_BYTES) continue;
    let text: string;
    try { text = readFileSync(filePath, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i] ?? '')) {
        const rel = filePath.slice(repoRoot.length + 1).replace(/\\/g, '/');
        findings.push({
          field: 'instrumentation_tag',
          message: `stray debug tag "${tag}" at ${rel}:${i + 1}`,
        });
      }
    }
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}
```

Register it in `BUILT_IN_VALIDATORS`:

```typescript
const BUILT_IN_VALIDATORS: Record<
  string,
  (artifact: Record<string, unknown>, ctx: ValidatorContext) => ValidatorResult
> = {
  'validate-artifact': (a) => validateArtifact(a),
  'validate-plan-scope': (a) => validatePlanScope(a),
  'validate-criteria-coverage': (a, ctx) => validateCriteriaCoverage(a, ctx),
  'validate-evaluation-gate': (a) => validateEvaluationGate(a),
  'validate-falsifiable-hypothesis': (a) => validateFalsifiableHypothesis(a),
  'validate-no-stray-debug-tags': (a, ctx) => validateNoStrayDebugTags(a, ctx),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd Agent_OS && npx vitest run tests/unit/validate-no-stray-debug-tags.test.ts`
Expected: PASS (6 tests pass).

- [ ] **Step 6: Verify backwards compat — existing validator tests still pass**

Run: `cd Agent_OS && npx vitest run tests/unit/validator-runner.test.ts`
Expected: PASS (existing tests unchanged — `repoRoot` is optional).

- [ ] **Step 7: Commit**

```bash
cd Agent_OS
git add src/core/validator-runner.ts tests/unit/validate-no-stray-debug-tags.test.ts
git commit -m "feat(validators): add validate-no-stray-debug-tags built-in

When DiagnosisRecord.instrumentation_tag is set, scan repoRoot (excluding
node_modules, .git, dist, build, etc.) for stray matches. Report file:line
findings. Tag is treated literally (regex-escaped). Files > 2MB skipped."
```

---

## Task 6: Add phased-diagnose flow to `/diagnose`

**Files:**
- Modify: `src/ccp/commands/diagnose.ts`
- Test: `tests/unit/diagnose-phased.test.ts`

When the active pack declares `prompts.diagnose.phases`, `/diagnose` runs each sub-phase: prompt the user with the markdown body, ask for confirmation that the exit condition is satisfied, optionally collect a hypothesis (for the falsifiable-hypothesis sub-phase) or instrumentation tag, persist the sub-phase outcome to the artifact. Legacy flow (pack has no `prompts.diagnose.phases`) runs unchanged.

The diagnose command currently does not consume `WorkflowPackManifest`. Add an optional `phasedConfig` parameter — the extension wires it from the active pack.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/diagnose-phased.test.ts`:

```typescript
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { runDiagnose } from '../../src/ccp/commands/diagnose';
import type { PromptPhaseDefinition } from '../../src/core/workflow-pack-loader';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/diagnose-phased');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makeRepo(name: string): string {
  const dir = join(TMP, name);
  mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
  writeFileSync(join(dir, '.agent-os', 'session.json'), JSON.stringify({}), 'utf-8');
  return dir;
}

function makeUi(answers: string[]) {
  let idx = 0;
  const next = () => {
    if (idx >= answers.length) throw new Error(`ui ran out of answers at index ${idx}`);
    return answers[idx++]!;
  };
  return {
    confirm: vi.fn(async () => true),
    input: vi.fn(async () => next()),
    select: vi.fn(async () => next()),
  };
}

const PHASED: PromptPhaseDefinition[] = [
  {
    id: 'build-feedback-loop',
    prompt: 'prompts/diagnose/01-loop.md',
    prompt_content: 'Pick a feedback loop mechanism.',
    exit_condition: 'feedback_loop_confirmed',
  },
  {
    id: 'reproduce',
    prompt: 'prompts/diagnose/02-reproduce.md',
    prompt_content: 'State the minimal repro.',
    exit_condition: 'reproduction_confirmed',
  },
  {
    id: 'falsifiable-hypothesis',
    prompt: 'prompts/diagnose/03-hypothesise.md',
    prompt_content: 'State at least one falsifiable hypothesis.',
    exit_condition: 'hypothesis_stated',
    validator: 'validate-falsifiable-hypothesis',
  },
  {
    id: 'instrument',
    prompt: 'prompts/diagnose/04-instrument.md',
    prompt_content: 'Add a tagged debug log.',
    exit_condition: 'instrumentation_acknowledged',
  },
  {
    id: 'fix-at-seam',
    prompt: 'prompts/diagnose/05-fix.md',
    prompt_content: 'Land the fix at a correct seam, OR record that no seam exists.',
    exit_condition: 'fix_applied_or_no_seam_reported',
  },
  {
    id: 'cleanup',
    prompt: 'prompts/diagnose/06-cleanup.md',
    prompt_content: 'Remove stray debug tags.',
    exit_condition: 'cleanup_done',
    validator: 'validate-no-stray-debug-tags',
  },
];

describe('runDiagnose — phased flow', () => {
  it('falls back to legacy flow when phasedConfig is undefined', async () => {
    const repoRoot = makeRepo('legacy');
    const ui = makeUi([
      'reported X', 'expected Y', 'minimal repro', 'unknown root cause',
      'medium',   // confidence
      'proceed',  // decision
    ]);
    const result = await runDiagnose({
      repoRoot, sessionId: 's1', bugSummary: 'bug',
      ui: ui as any,
    });
    expect(result.decision).toBe('proceed');
    const artifactPath = join(repoRoot, '.agent-os', 'tasks', result.taskId, 'diagnosis.yaml');
    const yaml = YAML.parse(readFileSync(artifactPath, 'utf-8'));
    expect(yaml.phases).toBeUndefined();
    expect(yaml.hypotheses).toBeUndefined();
  });

  it('runs each sub-phase when phasedConfig is provided', async () => {
    const repoRoot = makeRepo('phased');
    // Answers in order:
    // 1. feedback loop mechanism (input)
    // 2. confirm feedback_loop_confirmed (select yes/no -> "yes")
    // 3. minimal repro (input)
    // 4. confirm reproduction_confirmed -> "yes"
    // 5. hypothesis statement (input)
    // 6. confirm hypothesis_stated -> "yes"
    // 7. instrumentation tag (input)
    // 8. confirm instrumentation_acknowledged -> "yes"
    // 9. fix description (input)
    // 10. confirm fix_applied_or_no_seam_reported -> "yes"
    // 11. cleanup confirmation (input — "done")
    // 12. confirm cleanup_done -> "yes"
    // 13. decision (select proceed/blocked)
    const ui = makeUi([
      'curl',
      'yes',
      'npm test -- foo.test.ts',
      'yes',
      'if cache TTL is too long then stale data appears after cache clear',
      'yes',
      '[DEBUG-a4f2]',
      'yes',
      'guarded the cache invalidator',
      'yes',
      'removed all stray tags',
      'yes',
      'proceed',
    ]);
    const result = await runDiagnose({
      repoRoot, sessionId: 's1', bugSummary: 'bug',
      ui: ui as any,
      phasedConfig: PHASED,
    });
    expect(result.decision).toBe('proceed');

    const artifactPath = join(repoRoot, '.agent-os', 'tasks', result.taskId, 'diagnosis.yaml');
    const yaml = YAML.parse(readFileSync(artifactPath, 'utf-8'));
    expect(yaml.phases).toHaveLength(6);
    expect(yaml.phases.every((p: any) => p.satisfied)).toBe(true);
    expect(yaml.feedback_loop).toBe('curl');
    expect(yaml.hypotheses).toHaveLength(1);
    expect(yaml.hypotheses[0].statement).toMatch(/if .* then/i);
    expect(yaml.instrumentation_tag).toBe('[DEBUG-a4f2]');
  });

  it('records satisfied=false when user declines an exit condition', async () => {
    const repoRoot = makeRepo('decline');
    const ui = makeUi([
      'curl',
      'no',  // declines feedback_loop_confirmed — phased flow records and continues
      // Remaining inputs for shorter run — only first phase fails, rest skipped
      'blocked',
      'no feedback loop available',  // blockers
    ]);
    const result = await runDiagnose({
      repoRoot, sessionId: 's1', bugSummary: 'bug',
      ui: ui as any,
      phasedConfig: [PHASED[0]!],  // single sub-phase
    });
    expect(result.decision).toBe('blocked');
    const artifactPath = join(repoRoot, '.agent-os', 'tasks', result.taskId, 'diagnosis.yaml');
    const yaml = YAML.parse(readFileSync(artifactPath, 'utf-8'));
    expect(yaml.phases[0].satisfied).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Agent_OS && npx vitest run tests/unit/diagnose-phased.test.ts`
Expected: FAIL — `runDiagnose` doesn't accept `phasedConfig`.

- [ ] **Step 3: Extend `runDiagnose` signature and add phased branch**

Edit `src/ccp/commands/diagnose.ts`. Add the import at the top:

```typescript
import type { PromptPhaseDefinition } from '../../core/workflow-pack-loader';
```

Extend the args interface:

```typescript
export interface DiagnoseArgs {
  repoRoot: string;
  sessionId: string;
  bugSummary: string;
  ui: UiAdapter;
  phasedConfig?: PromptPhaseDefinition[]; // when present, run phased flow
}
```

Add a helper function (above `runDiagnose`):

```typescript
async function runPhasedSubPhases(
  args: DiagnoseArgs,
  taskId: string,
  phases: PromptPhaseDefinition[],
): Promise<{
  phaseRecords: Array<{ id: string; exit_condition: string; satisfied: boolean; user_note?: string }>;
  feedback_loop?: string;
  hypotheses?: Array<{ id: string; statement: string; rank: number }>;
  instrumentation_tag?: string;
  earlyBlocked: boolean;
}> {
  const phaseRecords: Array<{ id: string; exit_condition: string; satisfied: boolean; user_note?: string }> = [];
  let feedback_loop: string | undefined;
  let hypotheses: Array<{ id: string; statement: string; rank: number }> | undefined;
  let instrumentation_tag: string | undefined;
  let earlyBlocked = false;

  for (const phase of phases) {
    // Show the prompt content to the user via input. (Pi has no display-only primitive;
    // we use input for free-text capture per sub-phase. The prompt body is part of the prompt text.)
    const promptBody = phase.prompt_content?.trim() ?? '';
    const userInput = await args.ui.input(`[${taskId}] [${phase.id}] ${promptBody}`);

    // Capture sub-phase-specific output fields
    if (phase.id === 'build-feedback-loop') feedback_loop = userInput;
    if (phase.id === 'falsifiable-hypothesis') {
      hypotheses = [{ id: 'H1', statement: userInput, rank: 1 }];
    }
    if (phase.id === 'instrument') instrumentation_tag = userInput;

    // Ask for exit-condition confirmation
    const confirmation = await args.ui.select(
      `[${taskId}] Exit condition "${phase.exit_condition}" satisfied?`,
      ['yes', 'no'],
    );
    const satisfied = confirmation === 'yes';
    phaseRecords.push({
      id: phase.id,
      exit_condition: phase.exit_condition,
      satisfied,
      user_note: userInput,
    });

    if (!satisfied) {
      // User declined exit condition — stop the loop, mark blocked
      earlyBlocked = true;
      break;
    }
  }

  return { phaseRecords, feedback_loop, hypotheses, instrumentation_tag, earlyBlocked };
}
```

Modify `runDiagnose` to branch on `phasedConfig`. Replace the body of `runDiagnose` (after `emitAndProject` of DiagnoseStarted, before the `const env = makeEnvelope(...)` line):

The new body should look like this (replacing lines 49-92):

```typescript
  // ── Branch: phased flow ────────────────────────────────────────────────────
  if (args.phasedConfig && args.phasedConfig.length > 0) {
    const sub = await runPhasedSubPhases(args, taskId, args.phasedConfig);

    let decision: 'proceed' | 'blocked';
    let openBlockers: string[] = [];
    if (sub.earlyBlocked) {
      decision = 'blocked';
      const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
      openBlockers = blockersRaw.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const decisionChoice = await args.ui.select(
        `[${taskId}] Can we proceed to planning, or is this blocked?`,
        ['proceed', 'blocked'],
      );
      decision = decisionChoice as 'proceed' | 'blocked';
      if (decision === 'blocked') {
        const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
        openBlockers = blockersRaw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    const env = makeEnvelope({ taskId, artifactType: 'DiagnosisRecord' });
    const artifact = {
      ...env,
      artifact_type: 'DiagnosisRecord',
      bug_summary: args.bugSummary,
      reported_behavior: '',
      expected_behavior: '',
      minimal_case: sub.phaseRecords.find((p) => p.id === 'reproduce')?.user_note ?? '',
      suspected_root_cause: sub.hypotheses?.[0]?.statement ?? '',
      confidence: 'medium' as const,
      decision,
      open_blockers: openBlockers,
      phases: sub.phaseRecords,
      hypotheses: sub.hypotheses,
      feedback_loop: sub.feedback_loop,
      instrumentation_tag: sub.instrumentation_tag,
    };

    writeArtifact(args.repoRoot, taskId, 'diagnosis', artifact);

    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildDiagnoseCompletedEvent({
        sessionId: args.sessionId,
        taskId,
        confidence: 'medium',
        decision,
      }),
    );

    const nextState = decision === 'proceed' ? 'SHARED_UNDERSTANDING' : 'FAILED_BLOCKED';
    transitionTaskLifecycle({
      repoRoot: args.repoRoot,
      sessionId: args.sessionId,
      taskId,
      allowedFrom: ['DIAGNOSING'],
      to: nextState,
      triggeredBy: `/diagnose (phased, ${decision})`,
    });

    return {
      taskId,
      artifactPath: taskArtifactPath(args.repoRoot, taskId, 'diagnosis'),
      decision,
    };
  }

  // ── Legacy flow (unchanged) ────────────────────────────────────────────────
  const reportedBehavior = await args.ui.input(
    `[${taskId}] What is the REPORTED (broken) behavior?`,
  );
  const expectedBehavior = await args.ui.input(`[${taskId}] What is the EXPECTED behavior?`);
  const minimalCase = await args.ui.input(
    `[${taskId}] What is the minimal reproduction case (command or steps)?`,
  );
  const suspectedRoot = await args.ui.input(
    `[${taskId}] What do you suspect is the root cause? (ok to say "unknown")`,
  );
  const confidence = await args.ui.select(`[${taskId}] How confident are you in the root cause?`, [
    'low',
    'medium',
    'high',
  ]);
  const decisionChoice = await args.ui.select(
    `[${taskId}] Can we proceed to planning, or is this blocked?`,
    ['proceed', 'blocked'],
  );
  const decision = decisionChoice as 'proceed' | 'blocked';

  let openBlockers: string[] = [];
  if (decision === 'blocked') {
    const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
    openBlockers = blockersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const env = makeEnvelope({ taskId, artifactType: 'DiagnosisRecord' });
  const artifact = {
    ...env,
    artifact_type: 'DiagnosisRecord',
    bug_summary: args.bugSummary,
    reported_behavior: reportedBehavior,
    expected_behavior: expectedBehavior,
    minimal_case: minimalCase,
    suspected_root_cause: suspectedRoot,
    confidence,
    decision,
    open_blockers: openBlockers,
  };

  writeArtifact(args.repoRoot, taskId, 'diagnosis', artifact);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildDiagnoseCompletedEvent({
      sessionId: args.sessionId,
      taskId,
      confidence,
      decision,
    }),
  );

  const nextState = decision === 'proceed' ? 'SHARED_UNDERSTANDING' : 'FAILED_BLOCKED';
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId,
    allowedFrom: ['DIAGNOSING'],
    to: nextState,
    triggeredBy: `/diagnose (${decision})`,
  });

  return {
    taskId,
    artifactPath: taskArtifactPath(args.repoRoot, taskId, 'diagnosis'),
    decision,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Agent_OS && npx vitest run tests/unit/diagnose-phased.test.ts`
Expected: PASS (3 tests pass).

- [ ] **Step 5: Run all diagnose-adjacent tests to verify backwards compat**

Run: `cd Agent_OS && npx vitest run tests/`
Expected: all existing tests pass; new tests pass.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd Agent_OS && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd Agent_OS
git add src/ccp/commands/diagnose.ts tests/unit/diagnose-phased.test.ts
git commit -m "feat(diagnose): add opt-in phased flow driven by pack prompts

When a pack declares prompts.diagnose.phases, /diagnose runs each sub-phase
sequentially, captures user input per sub-phase, asks for exit-condition
confirmation, and persists per-sub-phase outcomes to the DiagnosisRecord.
Captures feedback_loop, hypotheses, instrumentation_tag for matching phase ids.

Legacy flow (no pack, or pack without prompts.diagnose.phases) is unchanged."
```

---

## Task 7: Wire narrator into pack-load and validator notifications in extension.ts

**Files:**
- Modify: `src/pi/extension.ts`

This is the minimal Track B integration — narrator wired into the highest-signal call sites only (pack lifecycle + validator results). A full audit of all 40+ `ui.notify` call sites is deferred to Phase 2 along with the `/status`/`/flight` rendering work.

- [ ] **Step 1: Locate the pack-load notification site**

Read `src/pi/extension.ts` around line 230-260 — the section where `loadWorkflowPacks` result is iterated. Currently emits raw strings via `ctx.ui.notify`.

Verify by running:

```bash
cd Agent_OS && npx grep "Workflow pack" -n src/pi/extension.ts
```

Expected: lines around 240-248 referencing `Workflow pack loaded` / `Workflow pack ignored` / `Workflow pack load failed`.

- [ ] **Step 2: Add narrator import**

At the top of `src/pi/extension.ts`, add to the import block (preserve existing imports):

```typescript
import { narrate } from '../core/narrator';
```

- [ ] **Step 3: Replace pack-lifecycle notifications**

Find the section that handles `loadWorkflowPacks` results (around lines 207-250). For each `ctx.ui.notify(...)` call related to pack lifecycle, wrap the message with `narrate('pack', ...)`. Specifically:

Replace:
```typescript
ctx.ui.notify(`Workflow pack loaded: ${result.manifest.workflow_pack_id} v${result.manifest.version}`, 'info');
```

With:
```typescript
ctx.ui.notify(narrate('pack', `${result.manifest.workflow_pack_id} v${result.manifest.version} loaded`), 'info');
```

Replace:
```typescript
ctx.ui.notify(
  `Workflow pack ignored: ${result.manifest.workflow_pack_id} — v1.x supports one active pack`,
  'info',
);
```

With:
```typescript
ctx.ui.notify(
  narrate('pack', `${result.manifest.workflow_pack_id} ignored — v1.x supports one active pack`),
  'info',
);
```

Replace:
```typescript
ctx.ui.notify(`Workflow pack load failed: ${result.error}`, 'error');
```

With:
```typescript
ctx.ui.notify(narrate('pack', `load failed — ${result.error}`), 'error');
```

Also: after a successful load, surface any prompt warnings if present (new in this plan). After the line that sets `activePackId = result.manifest.workflow_pack_id`, add:

```typescript
for (const w of result.manifest.prompt_warnings) {
  ctx.ui.notify(narrate('pack', w), 'info');
}
```

- [ ] **Step 4: Replace validator notifications**

Find the section that emits validator outcomes (around lines 299-360). Currently uses `ctx.ui.notify(\`[${id}] passed\`, 'info')` and similar. Replace with narrator calls.

Replace any line like:
```typescript
ctx.ui.notify(`[${id}] passed`, 'info');
```

With:
```typescript
ctx.ui.notify(narrate('validator', `${id} passed`), 'info');
```

Replace any line like:
```typescript
ctx.ui.notify(`[${id}] ${result.findings.length} finding(s): ${...}`, ...);
```

Pattern: replace the bracketed-id prefix scheme with `narrate('validator', ...)`. Use the existing message body, dropping the `[id]` prefix (since narrator adds `[validator]`).

- [ ] **Step 5: Run the full test suite**

Run: `cd Agent_OS && npx vitest run`
Expected: all tests pass. Existing tests don't assert on specific notification strings, so the narrator change is transparent.

Note: if any test fixture matches on the old `Workflow pack loaded:` prefix, update the fixture string to match the new narrator format. Search for such fixtures with:

```bash
cd Agent_OS && npx grep "Workflow pack" -n tests/
```

Expected: empty result (the existing tests don't assert on these specific strings) — but verify.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd Agent_OS && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd Agent_OS
git add src/pi/extension.ts
git commit -m "feat(pi): wire narrator into pack-lifecycle and validator notifications

- Pack load / ignore / load-failure now narrated as [pack] lines
- Validator pass / findings now narrated as [validator] lines
- Pack prompt_warnings surfaced after successful load
- Full audit of remaining ui.notify call sites deferred to Phase 2"
```

---

## Task 8: Bump package version and run final verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

Open `Agent_OS/package.json`. Find the `"version"` field. Bump to `1.5.0`.

Run: `cd Agent_OS && node -e "const p=require('./package.json'); console.log(p.version)"`
Expected: `1.5.0`.

- [ ] **Step 2: Run full test suite**

Run: `cd Agent_OS && npm test`
Expected: PASS. Tests added in this plan: narrator (6), pack-loader-prompts (7), validate-falsifiable-hypothesis (6), validate-no-stray-debug-tags (6), diagnose-phased (3). Total new: 28. Existing: 491 (per prior pass). Grand total: 519.

- [ ] **Step 3: Run TypeScript check**

Run: `cd Agent_OS && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Verify agent-os-core (existing pack) still loads unchanged**

Test setup outside this task is sufficient. The `workflow-pack-loader.test.ts` suite already covers no-prompts-field backwards compat. Confirm by running:

```bash
cd Agent_OS && npx vitest run tests/unit/workflow-pack-loader.test.ts tests/unit/pack-loader-prompts.test.ts
```

Expected: 16 tests pass (9 existing + 7 new).

- [ ] **Step 5: Commit version bump**

```bash
cd Agent_OS
git add package.json
git commit -m "chore: bump version to 1.5.0 for Phase 1 (pack seam prompts + narrator baseline)"
```

---

## Self-Review Checklist (executor: skim before declaring done)

**Spec coverage:**
- [ ] §10 Phase 1 Track A1 (pack loader prompts field) → Task 2 ✓
- [ ] §10 Phase 1 Track A2 (phased diagnose + DiagnosisRecord additive fields) → Tasks 3 + 6 ✓
- [ ] §10 Phase 1 Track A3 (validate-falsifiable-hypothesis) → Task 4 ✓
- [ ] §10 Phase 1 Track A3 (validate-no-stray-debug-tags) → Task 5 ✓
- [ ] §10 Phase 1 Track B1 (narrator module + tag scheme) → Task 1 ✓
- [ ] §10 Phase 1 Track B2 (wire narrator at minimum into pack + validator boundaries) → Task 7 ✓
- [ ] §10 Phase 1 Track B2 (audit all 40+ ui.notify call sites) → **deferred to Phase 2** (intentional; documented in plan + commit)
- [ ] §10 Phase 1 Track B3 (events.ts → narrator wiring) → **deferred to Phase 2** (intentional)

**Placeholder scan:** none — every step contains complete code.

**Type consistency:**
- `narrate(tag, message)` signature consistent across narrator module and extension.ts uses.
- `PromptPhaseDefinition` fields (`id`, `prompt`, `prompt_content`, `exit_condition`, `validator?`) match between loader, diagnose, and tests.
- `ValidatorContext.repoRoot?` optional in declaration; supplied by tests; consumed by validate-no-stray-debug-tags.
- `DiagnosisRecord` additive fields (`phases`, `hypotheses`, `feedback_loop`, `instrumentation_tag`) all `Type.Optional` — backwards compatible.

**Non-goals respected:**
- No new commands. ✓
- No external pack distribution. ✓
- No setup-workflow phase. ✓
- No LLM planning. ✓
- No validator path execution. ✓
- No Matt Pocock skill content imported. ✓
- Existing `agent-os-core` pack (no prompts) unchanged. ✓
- Legacy `/diagnose` flow unchanged. ✓

**Risks acknowledged:**
- Narrator wiring in this plan is minimal (pack + validator only). The full ui.notify audit and richer `/status`/`/flight` rendering arrive in Phase 2. Users will see `[pack]` and `[validator]` lines during command execution but will not yet see `[phase]` / `[doc]` / `[step]` lines on every action.
- Phased diagnose UX is captured-by-input (no display-only primitive in Pi). Users see the prompt body prepended to each input call. Acceptable for v1.5.0; Phase 2's richer rendering may revisit.

**Next plan after this:** Phase 2 — Ship `engineering-core` pack content + richer snapshot commands (`/status`, `/flight`, `/doctor`, `/trace`) + finish ui.notify narration audit. See `docs/2026-05-14-skill-pack-architecture-audit.md` §10 Phase 2.
