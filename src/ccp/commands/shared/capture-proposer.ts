import type { Event } from '../../../core/events';
import type { CaptureType } from '../../artifacts/knowledge-capture-record';

export interface CaptureProposal {
  type: CaptureType;
  text: string;
  evidence: string;
  scope: 'session' | 'project' | 'global';
}

export interface CaptureProposer {
  propose(args: { taskId: string; events: Event[] }): Promise<CaptureProposal[]>;
}

function payloadString(event: Event, key: string): string {
  const v = (event.payload as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

export function defaultCaptureProposer(): CaptureProposer {
  return {
    async propose({ events }) {
      const proposals: CaptureProposal[] = [];
      for (const e of events) {
        switch (e.event_type) {
          case 'COMMAND_COMPLETED': {
            const command = payloadString(e, 'command');
            const stepId = payloadString(e, 'step_id');
            proposals.push({
              type: 'command',
              text: command
                ? `Command "${command}" succeeded for this task.`
                : `Step ${stepId || 'unknown'} command succeeded for this task.`,
              evidence: e.event_id,
              scope: 'project',
            });
            break;
          }
          case 'COMMAND_FAILED': {
            const command = payloadString(e, 'command');
            const summary = payloadString(e, 'summary');
            proposals.push({
              type: 'failure',
              text: `Command "${command}" failed: ${summary}`.trim(),
              evidence: e.event_id,
              scope: 'project',
            });
            break;
          }
          case 'PLAN_APPROVED': {
            proposals.push({
              type: 'architecture',
              text: 'Plan approved by user — design choice worth remembering.',
              evidence: e.event_id,
              scope: 'project',
            });
            break;
          }
          case 'VERIFICATION_PASSED': {
            proposals.push({
              type: 'pattern',
              text: 'Verification commands above are known-good for this codebase.',
              evidence: e.event_id,
              scope: 'project',
            });
            break;
          }
        }
      }
      return proposals;
    },
  };
}
