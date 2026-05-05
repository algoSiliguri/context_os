import { describe, expect, it } from 'vitest';
import {
  buildCommandCompletedEvent,
  buildPlanApprovedEvent,
  buildVerificationPassedEvent,
} from '../../../../../src/ccp/ccp-events';
import { defaultCaptureProposer } from '../../../../../src/ccp/commands/shared/capture-proposer';

describe('defaultCaptureProposer', () => {
  it('proposes a "command" capture for each successful command run', async () => {
    const proposer = defaultCaptureProposer();
    const events = [
      buildCommandCompletedEvent({
        sessionId: 's1',
        taskId: 'T-001',
        stepId: 'S-1',
        command: 'npm test',
        exitCode: 0,
      }),
    ];
    const proposals = await proposer.propose({ taskId: 'T-001', events });
    expect(proposals.some((p) => p.type === 'command')).toBe(true);
  });

  it('proposes an "architecture" capture when a plan is approved', async () => {
    const proposer = defaultCaptureProposer();
    const events = [buildPlanApprovedEvent({ sessionId: 's1', taskId: 'T-001', planId: 'p-1' })];
    const proposals = await proposer.propose({ taskId: 'T-001', events });
    expect(proposals.some((p) => p.type === 'architecture')).toBe(true);
  });

  it('returns an empty list for an event log with no notable signals', async () => {
    const proposer = defaultCaptureProposer();
    const proposals = await proposer.propose({ taskId: 'T-001', events: [] });
    expect(proposals).toEqual([]);
  });
});
