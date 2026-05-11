import { randomUUID } from 'node:crypto';
import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifact, readArtifactRaw, writeArtifact } from '../artifacts/io';
import {
  buildPlanApprovedEvent,
  buildPlanCreatedEvent,
  buildPlanRejectedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { type PlanDrafter, defaultPlanDrafter } from './shared/plan-drafter';
import { requireTaskState, writeTaskState } from './shared/task-loader';

export type PlanOutcome = 'approved' | 'rejected';

export interface RunPlanArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  ui: UiAdapter;
  drafter?: PlanDrafter;
}

export async function runPlan(args: RunPlanArgs): Promise<{ outcome: PlanOutcome }> {
  requireTaskState(args.repoRoot, args.taskId, ['SHARED_UNDERSTANDING']);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      from: 'SHARED_UNDERSTANDING',
      to: 'PLANNING',
      triggeredBy: '/plan',
    }),
  );
  writeTaskState(args.repoRoot, args.taskId, 'PLANNING');

  // Diagnose tasks have no grill.yaml — fall back to diagnosis.yaml for goal.
  let grillGoal = '';
  let grillAssumptions: Array<{ id: string; text: string }> = [];
  let grillRisks: Array<{ id: string; risk: string }> = [];
  let grillConstraints: Array<{ id: string; text: string }> = [];
  let grillCriteria: Array<{ id: string; text: string }> = [];

  try {
    const grill = readArtifact(args.repoRoot, args.taskId, 'grill') as unknown as {
      goal: string;
      assumptions: Array<{ id: string; text: string }>;
      risks: Array<{ id: string; risk: string }>;
      constraints: Array<{ id: string; text: string }>;
      success_criteria: Array<{ id: string; text: string }>;
    };
    grillGoal = grill.goal ?? '';
    grillAssumptions = grill.assumptions ?? [];
    grillRisks = grill.risks ?? [];
    grillConstraints = grill.constraints ?? [];
    grillCriteria = grill.success_criteria ?? [];
  } catch {
    // No grill.yaml — try diagnosis.yaml (diagnose → plan flow)
    const diagnosis = readArtifactRaw(args.repoRoot, args.taskId, 'diagnosis');
    grillGoal = String(diagnosis?.bug_summary ?? 'bugfix task');
  }

  const drafter = args.drafter ?? defaultPlanDrafter();
  const draft = await drafter.draft({
    goal: grillGoal,
    assumptions: grillAssumptions,
    risks: grillRisks,
    constraints: grillConstraints,
    successCriteria: grillCriteria,
    workspaceRoot: args.repoRoot,
  });

  const env = makeEnvelope({ taskId: args.taskId, artifactType: 'PlanArtifact' });
  const planId = randomUUID();
  const planArtifact = {
    ...env,
    artifact_type: 'PlanArtifact' as const,
    artifact_id: planId,
    source_grill_record: 'most-recent-grill-on-task',
    scope: draft.scope,
    steps: draft.steps,
    approval_required: draft.approval_required,
    rollback: draft.rollback,
  };
  writeArtifact(args.repoRoot, args.taskId, 'plan', planArtifact);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildPlanCreatedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      planId,
      stepCount: draft.steps.length,
    }),
  );

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      from: 'PLANNING',
      to: 'AWAITING_PLAN_APPROVAL',
      triggeredBy: '/plan (drafted)',
    }),
  );
  writeTaskState(args.repoRoot, args.taskId, 'AWAITING_PLAN_APPROVAL');

  const summary = renderPlanSummary(draft);
  const approved = await args.ui.confirm(`${summary}\n\nApprove this plan?`);
  if (!approved) {
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildPlanRejectedEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        planId,
        reason: 'user rejected',
      }),
    );
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildTaskStateTransitionEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        from: 'AWAITING_PLAN_APPROVAL',
        to: 'SHARED_UNDERSTANDING',
        triggeredBy: '/plan (rejected)',
      }),
    );
    writeTaskState(args.repoRoot, args.taskId, 'SHARED_UNDERSTANDING');
    return { outcome: 'rejected' };
  }

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildPlanApprovedEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      planId,
    }),
  );
  return { outcome: 'approved' };
}

function renderPlanSummary(draft: { steps: Array<{ title: string; risk_tier: string }> }): string {
  const lines = draft.steps.map((s, i) => `  ${i + 1}. ${s.title} (risk: ${s.risk_tier})`);
  return `PLAN — ${draft.steps.length} steps:\n${lines.join('\n')}`;
}
