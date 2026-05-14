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
    if (!result || result.ok) return;
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
    if (!result || result.ok) return;
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.field)).toEqual(['hypotheses[0]', 'hypotheses[2]']);
  });
});
