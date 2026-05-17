import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifact, writeArtifact } from '../artifacts/io';
import { buildReviewCompletedEvent, buildReviewStartedEvent } from '../ccp-events';
import { taskArtifactPath } from '../task-paths';
import { transitionTaskLifecycle } from './shared/task-lifecycle';

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
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId: args.taskId,
    allowedFrom: ['AWAITING_HUMAN_REVIEW'],
    to: 'AWAITING_HUMAN_REVIEW',
    triggeredBy: '/review',
    policy: {
      subjectName: '/review',
      actionRequested: 'enter review',
      allowReason: 'state is AWAITING_HUMAN_REVIEW',
    },
  });

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildReviewStartedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
    }),
  );

  // Surface key artifacts for human review
  const plan = readArtifact(args.repoRoot, args.taskId, 'plan') as Record<string, unknown> | null;
  const planSteps = plan?.steps;
  const planStepCount = Array.isArray(planSteps) ? planSteps.length : '?';

  const verification = readArtifact(args.repoRoot, args.taskId, 'verification') as Record<
    string,
    unknown
  > | null;
  const verResult = typeof verification?.result === 'string' ? verification.result : 'unknown';

  await args.ui.confirm(
    `[${args.taskId}] Review: plan has ${planStepCount} steps. Verification: ${verResult}. See .agent-os/tasks/${args.taskId}/. Ready to review?`,
  );

  const scopeDrift = await args.ui.select(
    `[${args.taskId}] Was there any scope drift? (files changed outside plan scope?)`,
    ['no drift', 'minor drift', 'significant drift'],
  );

  const notes = await args.ui.input(`[${args.taskId}] Review notes (optional):`);

  const statusChoice = await args.ui.select(`[${args.taskId}] Review outcome?`, [
    'PASS',
    'PASS_WITH_DEGRADATION',
    'FAIL',
    'BLOCKED',
  ]);
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

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildReviewCompletedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      status,
    }),
  );

  if (status === 'PASS' || status === 'PASS_WITH_DEGRADATION') {
    transitionTaskLifecycle({
      repoRoot: args.repoRoot,
      sessionId: args.sessionId,
      taskId: args.taskId,
      allowedFrom: ['AWAITING_HUMAN_REVIEW'],
      to: 'EVALUATING',
      triggeredBy: `/review (${status})`,
    });
  } else {
    // FAIL or BLOCKED → back to VERIFYING for rework
    transitionTaskLifecycle({
      repoRoot: args.repoRoot,
      sessionId: args.sessionId,
      taskId: args.taskId,
      allowedFrom: ['AWAITING_HUMAN_REVIEW'],
      to: 'VERIFYING',
      triggeredBy: `/review (${status})`,
    });
  }

  return {
    status,
    artifactPath: taskArtifactPath(args.repoRoot, args.taskId, 'review'),
  };
}
