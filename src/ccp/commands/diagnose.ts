import { emitAndProject } from '../../core/projector';
import type { PromptPhaseDefinition } from '../../core/workflow-pack-loader';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { writeArtifact } from '../artifacts/io';
import { buildDiagnoseCompletedEvent, buildDiagnoseStartedEvent } from '../ccp-events';
import { allocateNextTaskId } from '../task-id';
import { taskArtifactPath } from '../task-paths';
import { setCurrentTaskId } from './shared/current-task';
import { createTaskLifecycle, transitionTaskLifecycle } from './shared/task-lifecycle';

export interface DiagnoseArgs {
  repoRoot: string;
  sessionId: string;
  bugSummary: string;
  ui: UiAdapter;
  phasedConfig?: PromptPhaseDefinition[]; // when present, run phased flow
}

export interface DiagnoseResult {
  taskId: string;
  artifactPath: string;
  decision: 'proceed' | 'blocked';
}

async function runPhasedSubPhases(
  args: DiagnoseArgs,
  taskId: string,
  phases: PromptPhaseDefinition[],
): Promise<{
  phaseRecords: Array<{ id: string; exit_condition: string; satisfied: boolean; user_note?: string }>;
  feedback_loop?: string;
  hypotheses?: Array<{ id: string; statement: string; rank: number }>;
  instrumentation_tag?: string;
  earlyBlocked: boolean;
}> {
  const phaseRecords: Array<{ id: string; exit_condition: string; satisfied: boolean; user_note?: string }> = [];
  let feedback_loop: string | undefined;
  let hypotheses: Array<{ id: string; statement: string; rank: number }> | undefined;
  let instrumentation_tag: string | undefined;
  let earlyBlocked = false;

  for (const phase of phases) {
    const promptBody = phase.prompt_content?.trim() ?? '';
    const userInput = await args.ui.input(`[${taskId}] [${phase.id}] ${promptBody}`);

    // Capture sub-phase-specific output fields
    if (phase.id === 'build-feedback-loop') feedback_loop = userInput;
    if (phase.id === 'falsifiable-hypothesis') {
      hypotheses = [{ id: 'H1', statement: userInput, rank: 1 }];
    }
    if (phase.id === 'instrument') instrumentation_tag = userInput;

    // Ask for exit-condition confirmation
    const confirmation = await args.ui.select(
      `[${taskId}] Exit condition "${phase.exit_condition}" satisfied?`,
      ['yes', 'no'],
    );
    const satisfied = confirmation === 'yes';
    phaseRecords.push({
      id: phase.id,
      exit_condition: phase.exit_condition,
      satisfied,
      user_note: userInput,
    });

    if (!satisfied) {
      earlyBlocked = true;
      break;
    }
  }

  return { phaseRecords, feedback_loop, hypotheses, instrumentation_tag, earlyBlocked };
}

export async function runDiagnose(args: DiagnoseArgs): Promise<DiagnoseResult> {
  const taskId = allocateNextTaskId(args.repoRoot);
  setCurrentTaskId(args.repoRoot, taskId);

  createTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId,
    goal: args.bugSummary,
    userType: 'developer',
  });
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId,
    allowedFrom: ['NEW_IDEA'],
    to: 'DIAGNOSING',
    triggeredBy: '/diagnose',
  });
  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildDiagnoseStartedEvent({ sessionId: args.sessionId, taskId }),
  );

  // ── Branch: phased flow ────────────────────────────────────────────────────
  if (args.phasedConfig && args.phasedConfig.length > 0) {
    const sub = await runPhasedSubPhases(args, taskId, args.phasedConfig);

    let decision: 'proceed' | 'blocked';
    let openBlockers: string[] = [];
    if (sub.earlyBlocked) {
      decision = 'blocked';
      const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
      openBlockers = blockersRaw.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const decisionChoice = await args.ui.select(
        `[${taskId}] Can we proceed to planning, or is this blocked?`,
        ['proceed', 'blocked'],
      );
      decision = decisionChoice as 'proceed' | 'blocked';
      if (decision === 'blocked') {
        const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
        openBlockers = blockersRaw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    const reproducePhase = sub.phaseRecords.find((p) => p.id === 'reproduce');
    const loopPhase = sub.phaseRecords.find((p) => p.id === 'build-feedback-loop');
    const env = makeEnvelope({ taskId, artifactType: 'DiagnosisRecord' });
    const artifact = {
      ...env,
      artifact_type: 'DiagnosisRecord' as const,
      bug_summary: args.bugSummary,
      reported_behavior: reproducePhase?.user_note ?? '(see phases[*].user_note)',
      expected_behavior: loopPhase?.user_note ?? '(see phases[*].user_note)',
      minimal_case: reproducePhase?.user_note ?? '',
      suspected_root_cause: sub.hypotheses?.[0]?.statement ?? '',
      confidence: 'medium' as const,
      decision,
      open_blockers: openBlockers,
      phases: sub.phaseRecords,
      hypotheses: sub.hypotheses,
      feedback_loop: sub.feedback_loop,
      instrumentation_tag: sub.instrumentation_tag,
    };

    writeArtifact(args.repoRoot, taskId, 'diagnosis', artifact);

    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildDiagnoseCompletedEvent({
        sessionId: args.sessionId,
        taskId,
        confidence: 'medium',
        decision,
      }),
    );

    const nextState = decision === 'proceed' ? 'SHARED_UNDERSTANDING' : 'FAILED_BLOCKED';
    transitionTaskLifecycle({
      repoRoot: args.repoRoot,
      sessionId: args.sessionId,
      taskId,
      allowedFrom: ['DIAGNOSING'],
      to: nextState,
      triggeredBy: `/diagnose (phased, ${decision})`,
    });

    return {
      taskId,
      artifactPath: taskArtifactPath(args.repoRoot, taskId, 'diagnosis'),
      decision,
    };
  }

  // ── Legacy flow (unchanged below this line) ────────────────────────────────
  // Structured diagnosis prompts
  const reportedBehavior = await args.ui.input(
    `[${taskId}] What is the REPORTED (broken) behavior?`,
  );
  const expectedBehavior = await args.ui.input(`[${taskId}] What is the EXPECTED behavior?`);
  const minimalCase = await args.ui.input(
    `[${taskId}] What is the minimal reproduction case (command or steps)?`,
  );
  const suspectedRoot = await args.ui.input(
    `[${taskId}] What do you suspect is the root cause? (ok to say "unknown")`,
  );
  const confidence = await args.ui.select(`[${taskId}] How confident are you in the root cause?`, [
    'low',
    'medium',
    'high',
  ]);
  const decisionChoice = await args.ui.select(
    `[${taskId}] Can we proceed to planning, or is this blocked?`,
    ['proceed', 'blocked'],
  );
  const decision = decisionChoice as 'proceed' | 'blocked';

  let openBlockers: string[] = [];
  if (decision === 'blocked') {
    const blockersRaw = await args.ui.input(`[${taskId}] List blockers (comma-separated):`);
    openBlockers = blockersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const env = makeEnvelope({ taskId, artifactType: 'DiagnosisRecord' });
  const artifact = {
    ...env,
    artifact_type: 'DiagnosisRecord',
    bug_summary: args.bugSummary,
    reported_behavior: reportedBehavior,
    expected_behavior: expectedBehavior,
    minimal_case: minimalCase,
    suspected_root_cause: suspectedRoot,
    confidence,
    decision,
    open_blockers: openBlockers,
  };

  writeArtifact(args.repoRoot, taskId, 'diagnosis', artifact);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildDiagnoseCompletedEvent({
      sessionId: args.sessionId,
      taskId,
      confidence,
      decision,
    }),
  );

  const nextState = decision === 'proceed' ? 'SHARED_UNDERSTANDING' : 'FAILED_BLOCKED';
  transitionTaskLifecycle({
    repoRoot: args.repoRoot,
    sessionId: args.sessionId,
    taskId,
    allowedFrom: ['DIAGNOSING'],
    to: nextState,
    triggeredBy: `/diagnose (${decision})`,
  });

  return {
    taskId,
    artifactPath: taskArtifactPath(args.repoRoot, taskId, 'diagnosis'),
    decision,
  };
}
