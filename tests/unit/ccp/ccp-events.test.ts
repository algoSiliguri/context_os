import { describe, expect, it } from 'vitest';
import {
  buildAnswerRecordedEvent,
  buildCommandCompletedEvent,
  buildCommandFailedEvent,
  buildCommandStartedEvent,
  buildFileChangedEvent,
  buildGrillStartedEvent,
  buildKnowledgeCaptureApprovedEvent,
  buildKnowledgeCaptureProposedEvent,
  buildKnowledgeCaptureRejectedEvent,
  buildPlanApprovedEvent,
  buildPlanCreatedEvent,
  buildPlanRejectedEvent,
  buildQuestionAskedEvent,
  buildSharedUnderstandingCreatedEvent,
  buildStepCompletedEvent,
  buildStepFailedEvent,
  buildStepStartedEvent,
  buildTaskAbortedEvent,
  buildTaskCompletedEvent,
  buildTaskCreatedEvent,
  buildTaskFailedEvent,
  buildTaskStateTransitionEvent,
  buildVerificationFailedEvent,
  buildVerificationPassedEvent,
  buildVerificationStartedEvent,
} from '../../../src/ccp/ccp-events';

const sessionId = 'sess-1';
const taskId = 'T-001';

describe('ccp-events', () => {
  it('TASK_CREATED carries task_id and goal in payload', () => {
    const e = buildTaskCreatedEvent({
      sessionId,
      taskId,
      goal: 'add rate limit',
      userType: 'developer',
    });
    expect(e.event_type).toBe('TASK_CREATED');
    expect(e.payload).toMatchObject({
      task_id: taskId,
      goal: 'add rate limit',
      user_type: 'developer',
    });
    expect(e.session_id).toBe(sessionId);
  });

  it('TASK_STATE_TRANSITION carries from / to', () => {
    const e = buildTaskStateTransitionEvent({
      sessionId,
      taskId,
      from: 'NEW_IDEA',
      to: 'GRILLING',
      triggeredBy: '/grill',
    });
    expect(e.event_type).toBe('TASK_STATE_TRANSITION');
    expect(e.payload).toMatchObject({
      task_id: taskId,
      from: 'NEW_IDEA',
      to: 'GRILLING',
      triggered_by: '/grill',
    });
  });

  it('all 22 builders produce events with task_id in payload (except where N/A)', () => {
    const builders = [
      buildTaskCreatedEvent({ sessionId, taskId, goal: 'g', userType: 'developer' }),
      buildTaskStateTransitionEvent({
        sessionId,
        taskId,
        from: 'NEW_IDEA',
        to: 'GRILLING',
        triggeredBy: '/grill',
      }),
      buildTaskCompletedEvent({ sessionId, taskId }),
      buildTaskFailedEvent({ sessionId, taskId, reason: 'r' }),
      buildTaskAbortedEvent({ sessionId, taskId, reason: 'r' }),
      buildGrillStartedEvent({ sessionId, taskId }),
      buildQuestionAskedEvent({
        sessionId,
        taskId,
        questionId: 'Q-1',
        question: '?',
        whyItMatters: 'because',
      }),
      buildAnswerRecordedEvent({ sessionId, taskId, questionId: 'Q-1', answer: 'a' }),
      buildSharedUnderstandingCreatedEvent({ sessionId, taskId, decisionProceed: true }),
      buildPlanCreatedEvent({ sessionId, taskId, planId: 'plan-1', stepCount: 5 }),
      buildPlanApprovedEvent({ sessionId, taskId, planId: 'plan-1' }),
      buildPlanRejectedEvent({ sessionId, taskId, planId: 'plan-1', reason: 'reject' }),
      buildCommandStartedEvent({ sessionId, taskId, stepId: 'S-1', command: 'npm test' }),
      buildCommandCompletedEvent({
        sessionId,
        taskId,
        stepId: 'S-1',
        command: 'npm test',
        exitCode: 0,
      }),
      buildCommandFailedEvent({ sessionId, taskId, stepId: 'S-1', exitCode: 1, summary: 'failed' }),
      buildFileChangedEvent({
        sessionId,
        taskId,
        stepId: 'S-1',
        path: 'a.ts',
        operation: 'modify',
      }),
      buildVerificationStartedEvent({ sessionId, taskId }),
      buildVerificationPassedEvent({ sessionId, taskId }),
      buildVerificationFailedEvent({ sessionId, taskId, summary: 'fail', nextAction: 'fix' }),
      buildKnowledgeCaptureProposedEvent({
        sessionId,
        taskId,
        captureId: 'K-1',
        captureType: 'convention',
      }),
      buildKnowledgeCaptureApprovedEvent({
        sessionId,
        taskId,
        captureId: 'K-1',
        brainNodeId: 'kn-1',
      }),
      buildKnowledgeCaptureRejectedEvent({ sessionId, taskId, captureId: 'K-1' }),
      buildStepStartedEvent({ sessionId, taskId, stepId: 'S-1', stepTitle: 'run tests', commandCount: 2 }),
      buildStepCompletedEvent({ sessionId, taskId, stepId: 'S-1' }),
      buildStepFailedEvent({ sessionId, taskId, stepId: 'S-2', reason: 'exit 1', recoverable: true }),
    ];
    expect(builders).toHaveLength(25);
    for (const e of builders) {
      expect(e.session_id).toBe(sessionId);
      expect(e.payload).toHaveProperty('task_id', taskId);
      expect(e.system_id).toBe('agent-os');
      expect(e.event_id).toMatch(/^[a-f0-9-]+$/);
    }
  });

  it('STEP_STARTED carries step metadata', () => {
    const e = buildStepStartedEvent({ sessionId, taskId, stepId: 'S-3', stepTitle: 'install deps', commandCount: 1 });
    expect(e.event_type).toBe('STEP_STARTED');
    expect(e.payload).toMatchObject({ step_id: 'S-3', step_title: 'install deps', command_count: 1 });
  });

  it('STEP_FAILED carries reason and recoverable flag', () => {
    const e = buildStepFailedEvent({ sessionId, taskId, stepId: 'S-4', reason: 'lint error', recoverable: false });
    expect(e.event_type).toBe('STEP_FAILED');
    expect(e.payload).toMatchObject({ step_id: 'S-4', reason: 'lint error', recoverable: false });
  });
});
