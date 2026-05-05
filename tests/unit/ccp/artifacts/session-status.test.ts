import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { SessionStatus, makeSessionStatus } from '../../../../src/ccp/artifacts/session-status';

describe('SessionStatus', () => {
  it('schema validates a populated status', () => {
    const s = {
      task_id: 'T-001',
      current_state: 'EXECUTING',
      current_step: '2/5',
      risk_tier: 'medium',
      pending_approvals: [{ tool: 'write_file', path: 'src/m.ts' }],
      last_meaningful_event: { event_type: 'COMMAND_COMPLETED', age_seconds: 14 },
      next_action: 'respond y/N to approval prompt',
    };
    expect(Value.Check(SessionStatus, s)).toBe(true);
  });

  it('makeSessionStatus assembles fields', () => {
    const s = makeSessionStatus({
      taskId: 'T-001',
      currentState: 'EXECUTING',
      currentStep: '2/5',
      riskTier: 'medium',
      pendingApprovals: [],
      lastMeaningfulEvent: null,
      nextAction: 'continue',
    });
    expect(s.task_id).toBe('T-001');
    expect(s.last_meaningful_event).toBe(null);
  });
});
