import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifactRaw as readArtifact, writeArtifact } from '../artifacts/io';
import {
  buildReviewCompletedEvent,
  buildReviewStartedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { taskArtifactPath } from '../task-paths';
import { requireTaskState, writeTaskState } from './shared/task-loader';
import { emitPolicyDecision } from './shared/policy-decision-writer';

export type ReviewStatus = 'PASS' | 'PASS_WITH_DEGRADATION' | 'FAIL' | 'BLOCKED';

export interface ReviewArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  ui: UiAdapter;
}

export interface ReviewResult {
  status: ReviewStatus;
  artifactPath: string;
}

export async function runReview(args: ReviewArgs): Promise<ReviewResult> {
  try {
    requireTaskState(args.repoRoot, args.taskId, ['AWAITING_HUMAN_REVIEW']);
    emitPolicyDecision(args.repoRoot, args.sessionId, {
      taskId: args.taskId, subjectType: 'phase_transition', subjectName: '/review',
      actionRequested: 'enter review', decision: 'allow', reasonCode: 'state_ok',
      reason: 'state is AWAITING_HUMAN_REVIEW', source: 'command_handler',
    });
  } catch (e) {
    emitPolicyDecision(args.repoRoot, args.sessionId, {
      taskId: args.taskId, subjectType: 'phase_transition', subjectName: '/review',
      actionRequested: 'enter review', decision: 'block', reasonCode: 'wrong_state',
      reason: (e as Error).message, source: 'command_handler',
    });
    throw e;
  }

  emitAndProject(args.repoRoot, args.sessionId, buildReviewStartedEvent({
    sessionId: args.sessionId, taskId: args.taskId,
  }));

  // Surface key artifacts for human review
  const plan = readArtifact(args.repoRoot, args.taskId, 'plan') as Record<string, unknown> | null;
  const planStepCount = Array.isArray((plan as any)?.steps) ? (plan as any).steps.length : '?';

  const verification = readArtifact(args.repoRoot, args.taskId, 'verification') as Record<string, unknown> | null;
  const verResult = (verification as any)?.result ?? 'unknown';

  await args.ui.confirm(
    `[${args.taskId}] Review: plan has ${planStepCount} steps. Verification: ${verResult}. See .agent-os/tasks/${args.taskId}/. Ready to review?`,
  );

  const scopeDrift = await args.ui.select(
    `[${args.taskId}] Was there any scope drift? (files changed outside plan scope?)`,
    ['no drift', 'minor drift', 'significant drift'],
  );

  const notes = await args.ui.input(
    `[${args.taskId}] Review notes (optional):`,
  );

  const statusChoice = await args.ui.select(
    `[${args.taskId}] Review outcome?`,
    ['PASS', 'PASS_WITH_DEGRADATION', 'FAIL', 'BLOCKED'],
  );
  const status = statusChoice as ReviewStatus;

  const env = makeEnvelope({ taskId: args.taskId, artifactType: 'ReviewRecord' });
  writeArtifact(args.repoRoot, args.taskId, 'review', {
    ...env,
    artifact_type: 'ReviewRecord',
    status,
    scope_drift: scopeDrift !== 'no drift',
    scope_drift_severity: scopeDrift,
    notes: notes || null,
    plan_step_count: planStepCount,
    verification_result: verResult,
  });

  emitAndProject(args.repoRoot, args.sessionId, buildReviewCompletedEvent({
    sessionId: args.sessionId, taskId: args.taskId, status,
  }));

  if (status === 'PASS' || status === 'PASS_WITH_DEGRADATION') {
    emitAndProject(args.repoRoot, args.sessionId, buildTaskStateTransitionEvent({
      sessionId: args.sessionId, taskId: args.taskId,
      from: 'AWAITING_HUMAN_REVIEW', to: 'EVALUATING',
      triggeredBy: `/review (${status})`,
    }));
    writeTaskState(args.repoRoot, args.taskId, 'EVALUATING');
  } else {
    // FAIL or BLOCKED → back to VERIFYING for rework
    emitAndProject(args.repoRoot, args.sessionId, buildTaskStateTransitionEvent({
      sessionId: args.sessionId, taskId: args.taskId,
      from: 'AWAITING_HUMAN_REVIEW', to: 'VERIFYING',
      triggeredBy: `/review (${status})`,
    }));
    writeTaskState(args.repoRoot, args.taskId, 'VERIFYING');
  }

  return {
    status,
    artifactPath: taskArtifactPath(args.repoRoot, args.taskId, 'review'),
  };
}
