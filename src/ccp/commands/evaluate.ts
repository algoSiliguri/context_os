import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifactRaw as readArtifact, writeArtifact } from '../artifacts/io';
import {
  buildEvaluateCompletedEvent,
  buildEvaluateStartedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { taskArtifactPath } from '../task-paths';
import { requireTaskState, writeTaskState } from './shared/task-loader';
import { emitPolicyDecision } from './shared/policy-decision-writer';

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
  try {
    requireTaskState(args.repoRoot, args.taskId, ['EVALUATING']);
    emitPolicyDecision(args.repoRoot, args.sessionId, {
      taskId: args.taskId, subjectType: 'phase_transition', subjectName: '/evaluate',
      actionRequested: 'enter EVALUATING', decision: 'allow', reasonCode: 'state_ok',
      reason: 'state is EVALUATING', source: 'command_handler',
    });
  } catch (e) {
    emitPolicyDecision(args.repoRoot, args.sessionId, {
      taskId: args.taskId, subjectType: 'phase_transition', subjectName: '/evaluate',
      actionRequested: 'enter EVALUATING', decision: 'block', reasonCode: 'wrong_state',
      reason: (e as Error).message, source: 'command_handler',
    });
    throw e;
  }

  emitAndProject(args.repoRoot, args.sessionId, buildEvaluateStartedEvent({
    sessionId: args.sessionId, taskId: args.taskId,
  }));

  // Read artifacts to compute evaluation
  const grill = readArtifact(args.repoRoot, args.taskId, 'grill') as Record<string, unknown> | null;
  const grillCriteria = Array.isArray((grill as any)?.success_criteria)
    ? (grill as any).success_criteria as unknown[]
    : [];
  const totalCriteria = grillCriteria.length;

  const verification = readArtifact(args.repoRoot, args.taskId, 'verification') as Record<string, unknown> | null;
  const verResult = (verification as any)?.result ?? 'unknown';

  const review = readArtifact(args.repoRoot, args.taskId, 'review') as Record<string, unknown> | null;
  const reviewStatus = (review as any)?.status ?? 'unknown';

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

  const outcomeChoice = await args.ui.select(
    `[${args.taskId}] Confirm task outcome:`,
    ['PASS', 'PASS_WITH_DEGRADATION', 'FAIL'],
  );
  const taskOutcome = outcomeChoice as TaskOutcome;

  const qualityChoice = await args.ui.select(
    `[${args.taskId}] Process quality?`,
    ['high', 'medium', 'low'],
  );
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

  emitAndProject(args.repoRoot, args.sessionId, buildEvaluateCompletedEvent({
    sessionId: args.sessionId,
    taskId: args.taskId,
    taskOutcome,
    criteriaSatisfactionRate,
  }));

  const nextState = taskOutcome !== 'FAIL' ? 'PERSISTING_KNOWLEDGE' : 'FAILED_RECOVERABLE';
  emitAndProject(args.repoRoot, args.sessionId, buildTaskStateTransitionEvent({
    sessionId: args.sessionId, taskId: args.taskId,
    from: 'EVALUATING', to: nextState,
    triggeredBy: `/evaluate (${taskOutcome})`,
  }));
  writeTaskState(args.repoRoot, args.taskId, nextState);

  return {
    taskOutcome,
    criteriaSatisfactionRate,
    artifactPath: taskArtifactPath(args.repoRoot, args.taskId, 'evaluation'),
  };
}
