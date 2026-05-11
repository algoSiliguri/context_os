import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBuiltinValidator, runValidatorsForPhase } from '../../src/core/validator-runner';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/validator-runner');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makeTaskDir(taskId: string, files: Record<string, string>): string {
  const dir = join(TMP, taskId);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
  return dir;
}

const BASE_ARTIFACT = {
  artifact_id: 'abc123',
  task_id: 'T-001',
  artifact_type: 'PlanArtifact',
  schema_version: 1,
  created_at: '2026-05-11T10:00:00.000Z',
};

const GRILL_YAML = `artifact_type: GrillRecord
task_id: T-001
schema_version: 1
created_at: 2026-05-11T10:00:00.000Z
success_criteria:
  - id: SC-001
    description: "Test passes"
`;

const GRILL_NO_CRITERIA = `artifact_type: GrillRecord
task_id: T-001
schema_version: 1
created_at: 2026-05-11T10:00:00.000Z
success_criteria: []
`;

// ── validate-artifact ────────────────────────────────────────────────────────
describe('validate-artifact', () => {
  const ctx = { taskDir: TMP, taskId: 'T-001' };

  it('passes a well-formed artifact', () => {
    const result = runBuiltinValidator('validate-artifact', BASE_ARTIFACT, ctx);
    expect(result?.ok).toBe(true);
  });

  it('fails when artifact_type is missing', () => {
    const a = { ...BASE_ARTIFACT, artifact_type: '' };
    const result = runBuiltinValidator('validate-artifact', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'artifact_type')).toBe(true);
  });

  it('fails when task_id does not match T-NNN pattern', () => {
    const a = { ...BASE_ARTIFACT, task_id: 'TASK-001' };
    const result = runBuiltinValidator('validate-artifact', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'task_id')).toBe(true);
  });

  it('fails when schema_version is missing', () => {
    const { schema_version: _, ...a } = BASE_ARTIFACT;
    const result = runBuiltinValidator('validate-artifact', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'schema_version')).toBe(true);
  });

  it('fails when created_at is not a valid date', () => {
    const a = { ...BASE_ARTIFACT, created_at: 'not-a-date' };
    const result = runBuiltinValidator('validate-artifact', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'created_at')).toBe(true);
  });
});

// ── validate-plan-scope ──────────────────────────────────────────────────────
describe('validate-plan-scope', () => {
  const ctx = { taskDir: TMP, taskId: 'T-001' };

  it('skips non-PlanArtifact artifacts', () => {
    const a = { ...BASE_ARTIFACT, artifact_type: 'GrillRecord' };
    const result = runBuiltinValidator('validate-plan-scope', a, ctx);
    expect(result?.ok).toBe(true);
  });

  it('passes a valid plan with scope and steps', () => {
    const a = {
      ...BASE_ARTIFACT,
      scope: { in: ['.'], out: [] },
      steps: [{ id: 'S-001', title: 'Do thing', commands: [] }],
    };
    const result = runBuiltinValidator('validate-plan-scope', a, ctx);
    expect(result?.ok).toBe(true);
  });

  it('fails when scope.in is empty', () => {
    const a = {
      ...BASE_ARTIFACT,
      scope: { in: [], out: [] },
      steps: [{ id: 'S-001', title: 'Do thing', commands: [] }],
    };
    const result = runBuiltinValidator('validate-plan-scope', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'scope.in')).toBe(true);
  });

  it('fails when steps is empty', () => {
    const a = { ...BASE_ARTIFACT, scope: { in: ['.'], out: [] }, steps: [] };
    const result = runBuiltinValidator('validate-plan-scope', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'steps')).toBe(true);
  });

  it('fails when a step is missing id', () => {
    const a = {
      ...BASE_ARTIFACT,
      scope: { in: ['.'], out: [] },
      steps: [{ title: 'No id step', commands: [] }],
    };
    const result = runBuiltinValidator('validate-plan-scope', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field?.includes('id'))).toBe(true);
  });
});

// ── validate-criteria-coverage ───────────────────────────────────────────────
describe('validate-criteria-coverage', () => {
  it('skips non-VerificationRecord artifacts', () => {
    const ctx = { taskDir: TMP, taskId: 'T-001' };
    const a = { ...BASE_ARTIFACT };
    const result = runBuiltinValidator('validate-criteria-coverage', a, ctx);
    expect(result?.ok).toBe(true);
  });

  it('passes when verification has commands and no grill criteria', () => {
    const dir = makeTaskDir('T-002', { 'grill.yaml': GRILL_NO_CRITERIA });
    const ctx = { taskDir: dir, taskId: 'T-002' };
    const a = {
      artifact_type: 'VerificationRecord',
      task_id: 'T-002',
      schema_version: 1,
      created_at: '2026-05-11T10:00:00.000Z',
      commands: [{ command: 'npm test', exit_code: 0 }],
      result: 'pass',
    };
    const result = runBuiltinValidator('validate-criteria-coverage', a, ctx);
    expect(result?.ok).toBe(true);
  });

  it('fails when verification has no commands', () => {
    const dir = makeTaskDir('T-003', {});
    const ctx = { taskDir: dir, taskId: 'T-003' };
    const a = {
      artifact_type: 'VerificationRecord',
      task_id: 'T-003',
      schema_version: 1,
      created_at: '2026-05-11T10:00:00.000Z',
      commands: [],
      result: 'pass',
    };
    const result = runBuiltinValidator('validate-criteria-coverage', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'commands')).toBe(true);
  });

  it('warns when grill had criteria but result is not pass', () => {
    const dir = makeTaskDir('T-004', { 'grill.yaml': GRILL_YAML });
    const ctx = { taskDir: dir, taskId: 'T-004' };
    const a = {
      artifact_type: 'VerificationRecord',
      task_id: 'T-004',
      schema_version: 1,
      created_at: '2026-05-11T10:00:00.000Z',
      commands: [{ command: 'npm test', exit_code: 0 }],
      result: 'fail',
    };
    const result = runBuiltinValidator('validate-criteria-coverage', a, ctx);
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings.some((f) => f.field === 'result')).toBe(true);
  });
});

// ── runValidatorsForPhase ────────────────────────────────────────────────────
describe('runValidatorsForPhase', () => {
  const ctx = { taskDir: TMP, taskId: 'T-001' };
  const defs = [
    { id: 'validate-artifact', path: 'validators/validate-artifact.ts', mode: 'advisory' as const },
  ];

  it('returns one result per known validator', () => {
    const results = runValidatorsForPhase(['validate-artifact'], defs, BASE_ARTIFACT, ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('validate-artifact');
  });

  it('skips unknown validators (future plugins)', () => {
    const results = runValidatorsForPhase(['unknown-validator'], defs, BASE_ARTIFACT, ctx);
    expect(results).toHaveLength(0);
  });

  it('uses advisory mode from validator def', () => {
    const results = runValidatorsForPhase(['validate-artifact'], defs, BASE_ARTIFACT, ctx);
    expect(results[0]!.mode).toBe('advisory');
  });

  it('defaults to advisory when validator has no def', () => {
    const results = runValidatorsForPhase(['validate-artifact'], [], BASE_ARTIFACT, ctx);
    expect(results[0]!.mode).toBe('advisory');
  });
});
