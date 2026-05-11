import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifactRaw as readArtifact, writeArtifactRaw as writeArtifact } from '../artifacts/io';
import {
  buildReviewCompletedEvent,
  buildReviewStartedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { taskArtifactPath } from '../task-paths';
import { requireTaskState, writeTaskState } from './shared/task-loader';

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
  requireTaskState(args.repoRoot, args.taskId, ['AWAITING_HUMAN_REVIEW']);

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
