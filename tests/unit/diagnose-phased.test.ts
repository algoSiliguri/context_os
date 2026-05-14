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
    expect(yaml.reported_behavior).toBe('npm test -- foo.test.ts');  // from reproduce sub-phase
    expect(yaml.expected_behavior).toBe('curl');                      // from build-feedback-loop sub-phase
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

  it('treats empty phasedConfig array as legacy flow', async () => {
    const repoRoot = makeRepo('empty-config');
    const ui = makeUi([
      'reported X', 'expected Y', 'minimal repro', 'unknown root cause',
      'medium',
      'proceed',
    ]);
    const result = await runDiagnose({
      repoRoot, sessionId: 's1', bugSummary: 'bug',
      ui: ui as any,
      phasedConfig: [],
    });
    expect(result.decision).toBe('proceed');
    const artifactPath = join(repoRoot, '.agent-os', 'tasks', result.taskId, 'diagnosis.yaml');
    const yaml = YAML.parse(readFileSync(artifactPath, 'utf-8'));
    expect(yaml.phases).toBeUndefined();
  });
});
