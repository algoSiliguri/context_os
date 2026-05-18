import { randomUUID } from 'node:crypto';
import { PackPlanDrafter } from '../../core/pack-plan-drafter';
import { emitAndProject } from '../../core/projector';
import { loadWorkflowPacks } from '../../core/workflow-pack-loader';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifact, writeArtifact } from '../artifacts/io';
import {
  buildPlanApprovedEvent,
  buildPlanCreatedEvent,
  buildPlanRejectedEvent,
} from '../ccp-events';
import { type PlanDrafter, defaultPlanDrafter } from './shared/plan-drafter';
import { transitionTaskLifecycle } from './shared/task-lifecycle';

function buildPlanDrafterFromActivePack(repoRoot: string): PlanDrafter {
  try {
    const packs = loadWorkflowPacks(repoRoot);
    const sorted = [...packs].sort((a, b) => a.packDir.localeCompare(b.packDir));
    const active = sorted.find((r) => r.ok);
    if (active?.ok && active.manifest.plan) {
      return new PackPlanDrafter(active.manifest.plan);
    }
  } catch {
    // best-effort — fall through
  }
  return defaultPlanDrafter();
}

export type PlanOutcome = 'approved' | 'rejected';

export interface RunPlanArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  ui: UiAdapter;
  drafter?: PlanDrafter;
}

export async function runPlan(args: RunPlanArgs): Promise<{ outcome: PlanOutcome }> {
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId: args.taskId,
    allowedFrom: ['SHARED_UNDERSTANDING'],
    to: 'PLANNING',
    triggeredBy: '/plan',
    policy: {
      subjectName: '/plan',
      actionRequested: 'enter PLANNING',
      allowReason: 'state is SHARED_UNDERSTANDING',
    },
  });

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
    // No grill.yaml — try diagnosis.yaml (diagnose → plan flow); throws if absent
    const diagnosis = readArtifact(args.repoRoot, args.taskId, 'diagnosis') as unknown as {
      bug_summary: string;
    };
    grillGoal = diagnosis.bug_summary;
  }

  const drafter = args.drafter ?? buildPlanDrafterFromActivePack(args.repoRoot);
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

  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId: args.taskId,
    allowedFrom: ['PLANNING'],
    to: 'AWAITING_PLAN_APPROVAL',
    triggeredBy: '/plan (drafted)',
  });

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
    transitionTaskLifecycle({
      repoRoot: args.repoRoot,
      sessionId: args.sessionId,
      taskId: args.taskId,
      allowedFrom: ['AWAITING_PLAN_APPROVAL'],
      to: 'SHARED_UNDERSTANDING',
      triggeredBy: '/plan (rejected)',
    });
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

function renderPlanSummary(draft: {
  steps: Array<{
    title: string;
    risk_tier: string;
    commands: Array<unknown>;
    verification: Array<unknown>;
  }>;
  detectedCommands?: Array<{ command: string; source_file: string; confidence: 'high' | 'low' }>;
}): string {
  const lines = draft.steps.map((s, i) => {
    const cmdNote =
      s.commands.length === 0
        ? ' — ⚠ no commands (edit plan.yaml before approving)'
        : ` — ${s.commands.length} command(s)`;
    return `  ${i + 1}. ${s.title} (risk: ${s.risk_tier})${cmdNote}`;
  });

  let verificationLine = '';
  if (draft.detectedCommands !== undefined) {
    if (draft.detectedCommands.length === 0) {
      verificationLine =
        '\nVerification: NONE DETECTED — no root-level test command found. Edit plan.yaml before /run.';
    } else {
      const [first, ...rest] = draft.detectedCommands;
      verificationLine = `\nVerification: ${first!.command} (detected from ${first!.source_file})`;
      if (rest.length > 0) {
        const alts = rest.map((d) => `${d.command} (${d.source_file})`).join(', ');
        verificationLine += `\nAlso detected: ${alts}`;
      }
    }
  }

  const hasEmptySteps = draft.steps.some((s) => s.commands.length === 0);
  const hint = hasEmptySteps
    ? '\n\nPlan has steps with no commands. Fill in commands in .agent-os/tasks/<id>/plan.yaml before /run will do real work.'
    : '';
  return `PLAN — ${draft.steps.length} steps:\n${lines.join('\n')}${verificationLine}${hint}`;
}
