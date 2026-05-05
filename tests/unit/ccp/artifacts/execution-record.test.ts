import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ExecutionRecord } from '../../../../src/ccp/artifacts/execution-record';

describe('ExecutionRecord', () => {
  const env = {
    artifact_id: 'a',
    task_id: 'T-001',
    artifact_type: 'ExecutionRecord',
    schema_version: 1,
    policy_version: 'v1',
    manifest_version: 'v1',
    created_at: '2026-05-04T12:00:00Z',
    validated_under: { schema_version: 1, policy_version: 'v1', manifest_version: 'v1' },
  };

  it('accepts a complete record', () => {
    const record = {
      ...env,
      plan_id: 'plan-1',
      harness: 'pi',
      started_at: '2026-05-04T12:00:00Z',
      ended_at: '2026-05-04T12:05:00Z',
      steps: [
        {
          step_id: 'S-1',
          status: 'completed',
          events: ['evt-1', 'evt-2'],
          files_changed: ['src/m.ts'],
          commands_run: ['npm test'],
          approvals: [{ tool: 'npm install', decided_by: 'user', at: '2026-05-04T12:01:00Z' }],
          failure: null,
        },
      ],
      final_state: 'VERIFYING',
    };
    expect(Value.Check(ExecutionRecord, record)).toBe(true);
  });

  it('rejects final_state: BOGUS', () => {
    const bad = {
      ...env,
      plan_id: 'p',
      harness: 'pi',
      started_at: 't',
      ended_at: 't',
      steps: [],
      final_state: 'BOGUS',
    };
    expect(Value.Check(ExecutionRecord, bad)).toBe(false);
  });

  it('rejects step.status outside enum', () => {
    const bad = {
      ...env,
      plan_id: 'p',
      harness: 'pi',
      started_at: 't',
      ended_at: 't',
      steps: [
        {
          step_id: 'S-1',
          status: 'maybe',
          events: [],
          files_changed: [],
          commands_run: [],
          approvals: [],
          failure: null,
        },
      ],
      final_state: 'EXECUTING',
    };
    expect(Value.Check(ExecutionRecord, bad)).toBe(false);
  });
});
