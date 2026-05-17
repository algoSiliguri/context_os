import { describe, expect, it } from 'vitest';
import {
  buildAnswerRecordedEvent,
  buildCommandCompletedEvent,
  buildCommandFailedEvent,
  buildCommandStartedEvent,
  buildDiagnoseCompletedEvent,
  buildDiagnoseStartedEvent,
  buildEvaluateCompletedEvent,
  buildEvaluateStartedEvent,
  buildFileChangedEvent,
  buildGrillStartedEvent,
  buildKnowledgeCaptureApprovedEvent,
  buildKnowledgeCaptureProposedEvent,
  buildKnowledgeCaptureRejectedEvent,
  buildPlanApprovedEvent,
  buildPlanCreatedEvent,
  buildPlanRejectedEvent,
  buildQuestionAskedEvent,
  buildQuickTaskCompletedEvent,
  buildQuickTaskStartedEvent,
  buildReviewCompletedEvent,
  buildReviewStartedEvent,
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

describe('all 33 ccp-events builders: event_type, session_id, timestamp', () => {
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const s = 'sess-char';
  const t = 'T-char';

  const cases: Array<[string, ReturnType<typeof buildTaskCreatedEvent>]> = [
    ['TASK_CREATED', buildTaskCreatedEvent({ sessionId: s, taskId: t, goal: 'g', userType: 'developer' })],
    ['TASK_STATE_TRANSITION', buildTaskStateTransitionEvent({ sessionId: s, taskId: t, from: 'NEW_IDEA', to: 'GRILLING', triggeredBy: '/grill' })],
    ['TASK_COMPLETED', buildTaskCompletedEvent({ sessionId: s, taskId: t })],
    ['TASK_FAILED', buildTaskFailedEvent({ sessionId: s, taskId: t, reason: 'r' })],
    ['TASK_ABORTED', buildTaskAbortedEvent({ sessionId: s, taskId: t, reason: 'r' })],
    ['GRILL_STARTED', buildGrillStartedEvent({ sessionId: s, taskId: t })],
    ['QUESTION_ASKED', buildQuestionAskedEvent({ sessionId: s, taskId: t, questionId: 'Q-1', question: '?', whyItMatters: 'because' })],
    ['ANSWER_RECORDED', buildAnswerRecordedEvent({ sessionId: s, taskId: t, questionId: 'Q-1', answer: 'a' })],
    ['SHARED_UNDERSTANDING_CREATED', buildSharedUnderstandingCreatedEvent({ sessionId: s, taskId: t, decisionProceed: true })],
    ['PLAN_CREATED', buildPlanCreatedEvent({ sessionId: s, taskId: t, planId: 'p-1', stepCount: 3 })],
    ['PLAN_APPROVED', buildPlanApprovedEvent({ sessionId: s, taskId: t, planId: 'p-1' })],
    ['PLAN_REJECTED', buildPlanRejectedEvent({ sessionId: s, taskId: t, planId: 'p-1', reason: 'no' })],
    ['COMMAND_STARTED', buildCommandStartedEvent({ sessionId: s, taskId: t, stepId: 'S-1', command: 'ls' })],
    ['COMMAND_COMPLETED', buildCommandCompletedEvent({ sessionId: s, taskId: t, stepId: 'S-1', command: 'ls', exitCode: 0 })],
    ['COMMAND_FAILED', buildCommandFailedEvent({ sessionId: s, taskId: t, stepId: 'S-1', exitCode: 1, summary: 'fail' })],
    ['FILE_CHANGED', buildFileChangedEvent({ sessionId: s, taskId: t, stepId: 'S-1', path: 'a.ts', operation: 'modify' })],
    ['STEP_STARTED', buildStepStartedEvent({ sessionId: s, taskId: t, stepId: 'S-1', stepTitle: 'run', commandCount: 1 })],
    ['STEP_COMPLETED', buildStepCompletedEvent({ sessionId: s, taskId: t, stepId: 'S-1' })],
    ['STEP_FAILED', buildStepFailedEvent({ sessionId: s, taskId: t, stepId: 'S-1', reason: 'r', recoverable: false })],
    ['VERIFICATION_STARTED', buildVerificationStartedEvent({ sessionId: s, taskId: t })],
    ['VERIFICATION_PASSED', buildVerificationPassedEvent({ sessionId: s, taskId: t })],
    ['VERIFICATION_FAILED', buildVerificationFailedEvent({ sessionId: s, taskId: t, summary: 'fail', nextAction: 'fix' })],
    ['KNOWLEDGE_CAPTURE_PROPOSED', buildKnowledgeCaptureProposedEvent({ sessionId: s, taskId: t, captureId: 'K-1', captureType: 'convention' })],
    ['KNOWLEDGE_CAPTURE_APPROVED', buildKnowledgeCaptureApprovedEvent({ sessionId: s, taskId: t, captureId: 'K-1', brainNodeId: 'kn-1' })],
    ['KNOWLEDGE_CAPTURE_REJECTED', buildKnowledgeCaptureRejectedEvent({ sessionId: s, taskId: t, captureId: 'K-1' })],
    ['DIAGNOSE_STARTED', buildDiagnoseStartedEvent({ sessionId: s, taskId: t })],
    ['DIAGNOSE_COMPLETED', buildDiagnoseCompletedEvent({ sessionId: s, taskId: t, confidence: 'high', decision: 'fix' })],
    ['QUICK_TASK_STARTED', buildQuickTaskStartedEvent({ sessionId: s, taskId: t })],
    ['QUICK_TASK_COMPLETED', buildQuickTaskCompletedEvent({ sessionId: s, taskId: t, status: 'done', filesChanged: 2 })],
    ['REVIEW_STARTED', buildReviewStartedEvent({ sessionId: s, taskId: t })],
    ['REVIEW_COMPLETED', buildReviewCompletedEvent({ sessionId: s, taskId: t, status: 'approved' })],
    ['EVALUATE_STARTED', buildEvaluateStartedEvent({ sessionId: s, taskId: t })],
    ['EVALUATE_COMPLETED', buildEvaluateCompletedEvent({ sessionId: s, taskId: t, taskOutcome: 'success', criteriaSatisfactionRate: 1.0 })],
  ];

  it('has 33 builders', () => {
    expect(cases).toHaveLength(33);
  });

  for (const [expectedType, e] of cases) {
    it(`${expectedType}: event_type, session_id, timestamp`, () => {
      expect(e.event_type).toBe(expectedType);
      expect(e.session_id).toBe(s);
      expect(e.timestamp).toMatch(ISO_RE);
      expect(e.system_id).toBe('agent-os');
    });
  }
});
