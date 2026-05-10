import { randomUUID } from 'node:crypto';

import type { Event } from '../core/events';

interface CcpBaseOpts {
  sessionId: string;
  taskId: string;
  timestamp?: string;
  parentSpanId?: string | null;
  harnessId?: string;
}

function ccpBase(eventType: string, opts: CcpBaseOpts, extras: Record<string, unknown>): Event {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    session_id: opts.sessionId,
    trace_id: opts.sessionId,
    span_id: randomUUID(),
    parent_span_id: opts.parentSpanId ?? null,
    system_id: 'agent-os',
    constitution_version: 'v2',
    harness_id: opts.harnessId ?? 'pi',
    timestamp: opts.timestamp ?? new Date().toISOString(),
    payload: { task_id: opts.taskId, ...extras },
  };
}

// ----- Task lifecycle -----

export function buildTaskCreatedEvent(args: {
  sessionId: string;
  taskId: string;
  goal: string;
  userType: 'developer' | 'mixed' | 'non_developer';
}): Event {
  return ccpBase('TASK_CREATED', args, { goal: args.goal, user_type: args.userType });
}

export function buildTaskStateTransitionEvent(args: {
  sessionId: string;
  taskId: string;
  from: string;
  to: string;
  triggeredBy: string;
}): Event {
  return ccpBase('TASK_STATE_TRANSITION', args, {
    from: args.from,
    to: args.to,
    triggered_by: args.triggeredBy,
  });
}

export function buildTaskCompletedEvent(args: { sessionId: string; taskId: string }): Event {
  return ccpBase('TASK_COMPLETED', args, {});
}

export function buildTaskFailedEvent(args: {
  sessionId: string;
  taskId: string;
  reason: string;
}): Event {
  return ccpBase('TASK_FAILED', args, { reason: args.reason });
}

export function buildTaskAbortedEvent(args: {
  sessionId: string;
  taskId: string;
  reason: string;
}): Event {
  return ccpBase('TASK_ABORTED', args, { reason: args.reason });
}

// ----- Grill -----

export function buildGrillStartedEvent(args: { sessionId: string; taskId: string }): Event {
  return ccpBase('GRILL_STARTED', args, {});
}

export function buildQuestionAskedEvent(args: {
  sessionId: string;
  taskId: string;
  questionId: string;
  question: string;
  whyItMatters: string;
}): Event {
  return ccpBase('QUESTION_ASKED', args, {
    question_id: args.questionId,
    question: args.question,
    why_it_matters: args.whyItMatters,
  });
}

export function buildAnswerRecordedEvent(args: {
  sessionId: string;
  taskId: string;
  questionId: string;
  answer: string;
}): Event {
  return ccpBase('ANSWER_RECORDED', args, {
    answer: args.answer,
    question_id: args.questionId,
  });
}

export function buildSharedUnderstandingCreatedEvent(args: {
  sessionId: string;
  taskId: string;
  decisionProceed: boolean;
}): Event {
  return ccpBase('SHARED_UNDERSTANDING_CREATED', args, {
    decision_proceed: args.decisionProceed,
  });
}

// ----- Plan -----

export function buildPlanCreatedEvent(args: {
  sessionId: string;
  taskId: string;
  planId: string;
  stepCount: number;
}): Event {
  return ccpBase('PLAN_CREATED', args, { plan_id: args.planId, step_count: args.stepCount });
}

export function buildPlanApprovedEvent(args: {
  sessionId: string;
  taskId: string;
  planId: string;
}): Event {
  return ccpBase('PLAN_APPROVED', args, { plan_id: args.planId });
}

export function buildPlanRejectedEvent(args: {
  sessionId: string;
  taskId: string;
  planId: string;
  reason: string;
}): Event {
  return ccpBase('PLAN_REJECTED', args, { plan_id: args.planId, reason: args.reason });
}

// ----- Execute -----

export function buildCommandStartedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  command: string;
}): Event {
  return ccpBase('COMMAND_STARTED', args, { command: args.command, step_id: args.stepId });
}

export function buildCommandCompletedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  command: string;
  exitCode: number;
}): Event {
  return ccpBase('COMMAND_COMPLETED', args, {
    step_id: args.stepId,
    command: args.command,
    exit_code: args.exitCode,
  });
}

export function buildCommandFailedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  exitCode: number;
  summary: string;
}): Event {
  return ccpBase('COMMAND_FAILED', args, {
    exit_code: args.exitCode,
    step_id: args.stepId,
    summary: args.summary,
  });
}

export function buildFileChangedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  path: string;
  operation: 'create' | 'delete' | 'modify';
}): Event {
  return ccpBase('FILE_CHANGED', args, {
    operation: args.operation,
    path: args.path,
    step_id: args.stepId,
  });
}

// ----- Steps (Black Box: executor boundary) -----

export function buildStepStartedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  stepTitle: string;
  commandCount: number;
}): Event {
  return ccpBase('STEP_STARTED', args, {
    step_id: args.stepId,
    step_title: args.stepTitle,
    command_count: args.commandCount,
  });
}

export function buildStepCompletedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
}): Event {
  return ccpBase('STEP_COMPLETED', args, { step_id: args.stepId });
}

export function buildStepFailedEvent(args: {
  sessionId: string;
  taskId: string;
  stepId: string;
  reason: string;
  recoverable: boolean;
}): Event {
  return ccpBase('STEP_FAILED', args, {
    step_id: args.stepId,
    reason: args.reason,
    recoverable: args.recoverable,
  });
}

// ----- Verify -----

export function buildVerificationStartedEvent(args: {
  sessionId: string;
  taskId: string;
}): Event {
  return ccpBase('VERIFICATION_STARTED', args, {});
}

export function buildVerificationPassedEvent(args: {
  sessionId: string;
  taskId: string;
}): Event {
  return ccpBase('VERIFICATION_PASSED', args, {});
}

export function buildVerificationFailedEvent(args: {
  sessionId: string;
  taskId: string;
  summary: string;
  nextAction: string;
}): Event {
  return ccpBase('VERIFICATION_FAILED', args, {
    next_action: args.nextAction,
    summary: args.summary,
  });
}

// ----- Knowledge -----

export function buildKnowledgeCaptureProposedEvent(args: {
  sessionId: string;
  taskId: string;
  captureId: string;
  captureType:
    | 'architecture'
    | 'command'
    | 'convention'
    | 'decision'
    | 'failure'
    | 'pattern'
    | 'warning';
}): Event {
  return ccpBase('KNOWLEDGE_CAPTURE_PROPOSED', args, {
    capture_id: args.captureId,
    capture_type: args.captureType,
  });
}

export function buildKnowledgeCaptureApprovedEvent(args: {
  sessionId: string;
  taskId: string;
  captureId: string;
  brainNodeId: string;
}): Event {
  return ccpBase('KNOWLEDGE_CAPTURE_APPROVED', args, {
    brain_node_id: args.brainNodeId,
    capture_id: args.captureId,
  });
}

export function buildKnowledgeCaptureRejectedEvent(args: {
  sessionId: string;
  taskId: string;
  captureId: string;
}): Event {
  return ccpBase('KNOWLEDGE_CAPTURE_REJECTED', args, { capture_id: args.captureId });
}
