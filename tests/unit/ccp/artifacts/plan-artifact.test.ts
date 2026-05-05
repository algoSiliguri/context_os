import { Value } from '@sinclair/typebox/value';
// tests/unit/ccp/artifacts/plan-artifact.test.ts
import { describe, expect, it } from 'vitest';
import { PlanArtifact } from '../../../../src/ccp/artifacts/plan-artifact';

describe('PlanArtifact', () => {
  const env = {
    artifact_id: 'a-1',
    task_id: 'T-001',
    artifact_type: 'PlanArtifact',
    schema_version: 1,
    policy_version: 'v1',
    manifest_version: 'v1',
    created_at: '2026-05-04T12:00:00Z',
    validated_under: { schema_version: 1, policy_version: 'v1', manifest_version: 'v1' },
  };

  it('accepts a valid plan', () => {
    const plan = {
      ...env,
      source_grill_record: 'a-grill',
      scope: { in: ['src/'], out: ['db/'] },
      steps: [
        {
          id: 'S-1',
          title: 'Add middleware',
          purpose: 'Enforce limit',
          expected_files: [{ path: 'src/m.ts', operation: 'create' }],
          commands: [{ command: 'npm install', approval_tier: 3 }],
          verification: [{ command: 'npm test', expected_signal: 'exit code 0' }],
          risk_tier: 'medium',
          depends_on: [],
        },
      ],
      approval_required: [{ id: 'S-1', reason: 'tier-3 install' }],
      rollback: { strategy: 'git reset --hard pre-state' },
    };
    expect(Value.Check(PlanArtifact, plan)).toBe(true);
  });

  it('rejects step.commands.approval_tier=5', () => {
    const bad = {
      ...env,
      source_grill_record: 'a-grill',
      scope: { in: [], out: [] },
      steps: [
        {
          id: 'S-1',
          title: 't',
          purpose: 'p',
          expected_files: [],
          commands: [{ command: 'x', approval_tier: 5 }],
          verification: [],
          risk_tier: 'low',
          depends_on: [],
        },
      ],
      approval_required: [],
      rollback: { strategy: 's' },
    };
    expect(Value.Check(PlanArtifact, bad)).toBe(false);
  });

  it('rejects expected_files.operation outside enum', () => {
    const bad = {
      ...env,
      source_grill_record: 'a',
      scope: { in: [], out: [] },
      steps: [
        {
          id: 'S-1',
          title: 't',
          purpose: 'p',
          expected_files: [{ path: 'x', operation: 'rename' }],
          commands: [],
          verification: [],
          risk_tier: 'low',
          depends_on: [],
        },
      ],
      approval_required: [],
      rollback: { strategy: 's' },
    };
    expect(Value.Check(PlanArtifact, bad)).toBe(false);
  });
});
