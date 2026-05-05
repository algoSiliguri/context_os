import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { VerificationRecord } from '../../../../src/ccp/artifacts/verification-record';

describe('VerificationRecord', () => {
  const env = {
    artifact_id: 'a',
    task_id: 'T-001',
    artifact_type: 'VerificationRecord',
    schema_version: 1,
    policy_version: 'v1',
    manifest_version: 'v1',
    created_at: '2026-05-04T12:00:00Z',
    validated_under: { schema_version: 1, policy_version: 'v1', manifest_version: 'v1' },
  };

  it('accepts a pass result', () => {
    const r = {
      ...env,
      commands: [
        {
          command: 'npm test',
          run_at: '2026-05-04T12:00:00Z',
          exit_code: 0,
          summary: '5 passed',
          raw_output_ref: '.agent-os/tasks/T-001/raw/abc.txt',
        },
      ],
      result: 'pass',
      next_action: null,
    };
    expect(Value.Check(VerificationRecord, r)).toBe(true);
  });

  it('rejects result outside enum', () => {
    const bad = {
      ...env,
      commands: [],
      result: 'maybe',
      next_action: null,
    };
    expect(Value.Check(VerificationRecord, bad)).toBe(false);
  });
});
