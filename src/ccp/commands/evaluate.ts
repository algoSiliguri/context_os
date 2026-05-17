import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifact, writeArtifact } from '../artifacts/io';
import { buildEvaluateCompletedEvent, buildEvaluateStartedEvent } from '../ccp-events';
import { taskArtifactPath } from '../task-paths';
import { transitionTaskLifecycle } from './shared/task-lifecycle';

export type TaskOutcome = 'PASS' | 'PASS_WITH_DEGRADATION' | 'FAIL';
export type ProcessQuality = 'high' | 'medium' | 'low';

export interface EvaluateArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  ui: UiAdapter;
}

export interface EvaluateResult {
  taskOutcome: TaskOutcome;
  criteriaSatisfactionRate: number;
  artifactPath: string;
}

export async function runEvaluate(args: EvaluateArgs): Promise<EvaluateResult> {
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId: args.taskId,
    allowedFrom: ['EVALUATING'],
    to: 'EVALUATING',
    triggeredBy: '/evaluate',
    policy: {
      subjectName: '/evaluate',
      actionRequested: 'enter EVALUATING',
      allowReason: 'state is EVALUATING',
    },
  });

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildEvaluateStartedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
    }),
  );

  // Read artifacts to compute evaluation
  const grill = readArtifact(args.repoRoot, args.taskId, 'grill') as Record<string, unknown> | null;
  const successCriteria = grill?.success_criteria;
  const grillCriteria = Array.isArray(successCriteria) ? successCriteria : [];
  const totalCriteria = grillCriteria.length;

  const verification = readArtifact(args.repoRoot, args.taskId, 'verification') as Record<
    string,
    unknown
  > | null;
  const verResult = typeof verification?.result === 'string' ? verification.result : 'unknown';

  const review = readArtifact(args.repoRoot, args.taskId, 'review') as Record<
    string,
    unknown
  > | null;
  const reviewStatus = typeof review?.status === 'string' ? review.status : 'unknown';

  // Compute criteria satisfaction rate from verification result
  let criteriaSatisfactionRate: number;
  if (verResult === 'pass') {
    criteriaSatisfactionRate = 1.0;
  } else if (verResult === 'pass_with_degradation') {
    criteriaSatisfactionRate = 0.75;
  } else {
    criteriaSatisfactionRate = 0.0;
  }

  // Surface summary for human confirmation
  const metCount = Math.round(criteriaSatisfactionRate * Math.max(totalCriteria, 1));
  await args.ui.confirm(
    `[${args.taskId}] Evaluation: ${metCount}/${totalCriteria || '?'} criteria met (${Math.round(criteriaSatisfactionRate * 100)}%). Verification: ${verResult}. Review: ${reviewStatus}. Confirm?`,
  );

  const outcomeChoice = await args.ui.select(`[${args.taskId}] Confirm task outcome:`, [
    'PASS',
    'PASS_WITH_DEGRADATION',
    'FAIL',
  ]);
  const taskOutcome = outcomeChoice as TaskOutcome;

  const qualityChoice = await args.ui.select(`[${args.taskId}] Process quality?`, [
    'high',
    'medium',
    'low',
  ]);
  const processQuality = qualityChoice as ProcessQuality;

  const notes = await args.ui.input(`[${args.taskId}] Evaluation notes (optional):`);

  const env = makeEnvelope({ taskId: args.taskId, artifactType: 'EvaluationRecord' });
  writeArtifact(args.repoRoot, args.taskId, 'evaluation', {
    ...env,
    artifact_type: 'EvaluationRecord',
    task_outcome: taskOutcome,
    criteria_satisfaction_rate: criteriaSatisfactionRate,
    total_criteria: totalCriteria,
    verification_result: verResult,
    review_status: reviewStatus,
    process_quality: processQuality,
    notes: notes || null,
  });

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildEvaluateCompletedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      taskOutcome,
      criteriaSatisfactionRate,
    }),
  );

  const nextState = taskOutcome !== 'FAIL' ? 'PERSISTING_KNOWLEDGE' : 'FAILED_RECOVERABLE';
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId: args.taskId,
    allowedFrom: ['EVALUATING'],
    to: nextState,
    triggeredBy: `/evaluate (${taskOutcome})`,
  });

  return {
    taskOutcome,
    criteriaSatisfactionRate,
    artifactPath: taskArtifactPath(args.repoRoot, args.taskId, 'evaluation'),
  };
}
