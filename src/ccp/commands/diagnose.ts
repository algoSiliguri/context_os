import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { writeArtifact } from '../artifacts/io';
import {
  buildDiagnoseCompletedEvent,
  buildDiagnoseStartedEvent,
  buildTaskCreatedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { allocateNextTaskId } from '../task-id';
import { taskArtifactPath } from '../task-paths';
import { setCurrentTaskId } from './shared/current-task';
import { writeTaskState } from './shared/task-loader';

export interface DiagnoseArgs {
  repoRoot: string;
  sessionId: string;
  bugSummary: string;
  ui: UiAdapter;
}

export interface DiagnoseResult {
  taskId: string;
  artifactPath: string;
  decision: 'proceed' | 'blocked';
}

export async function runDiagnose(args: DiagnoseArgs): Promise<DiagnoseResult> {
  const taskId = allocateNextTaskId(args.repoRoot);
  setCurrentTaskId(args.repoRoot, taskId);

  emitAndProject(args.repoRoot, args.sessionId, buildTaskCreatedEvent({
    sessionId: args.sessionId,
    taskId,
    goal: args.bugSummary,
    userType: 'developer',
  }));
  writeTaskState(args.repoRoot, taskId, 'NEW_IDEA', args.sessionId);

  emitAndProject(args.repoRoot, args.sessionId, buildTaskStateTransitionEvent({
    sessionId: args.sessionId,
    taskId,
    from: 'NEW_IDEA',
    to: 'DIAGNOSING',
    triggeredBy: '/diagnose',
  }));
  writeTaskState(args.repoRoot, taskId, 'DIAGNOSING');
  emitAndProject(args.repoRoot, args.sessionId, buildDiagnoseStartedEvent({ sessionId: args.sessionId, taskId }));

  // Structured diagnosis prompts
  const reportedBehavior = await args.ui.input(
    `[${taskId}] What is the REPORTED (broken) behavior?`,
  );
  const expectedBehavior = await args.ui.input(
    `[${taskId}] What is the EXPECTED behavior?`,
  );
  const minimalCase = await args.ui.input(
    `[${taskId}] What is the minimal reproduction case (command or steps)?`,
  );
  const suspectedRoot = await args.ui.input(
    `[${taskId}] What do you suspect is the root cause? (ok to say "unknown")`,
  );
  const confidence = await args.ui.select(
    `[${taskId}] How confident are you in the root cause?`,
    ['low', 'medium', 'high'],
  );
  const decisionChoice = await args.ui.select(
    `[${taskId}] Can we proceed to planning, or is this blocked?`,
    ['proceed', 'blocked'],
  );
  const decision = decisionChoice as 'proceed' | 'blocked';

  let openBlockers: string[] = [];
  if (decision === 'blocked') {
    const blockersRaw = await args.ui.input(
      `[${taskId}] List blockers (comma-separated):`,
    );
    openBlockers = blockersRaw.split(',').map((s) => s.trim()).filter(Boolean);
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

  emitAndProject(args.repoRoot, args.sessionId, buildDiagnoseCompletedEvent({
    sessionId: args.sessionId,
    taskId,
    confidence,
    decision,
  }));

  const nextState = decision === 'proceed' ? 'SHARED_UNDERSTANDING' : 'FAILED_BLOCKED';
  emitAndProject(args.repoRoot, args.sessionId, buildTaskStateTransitionEvent({
    sessionId: args.sessionId,
    taskId,
    from: 'DIAGNOSING',
    to: nextState,
    triggeredBy: `/diagnose (${decision})`,
  }));
  writeTaskState(args.repoRoot, taskId, nextState);

  return {
    taskId,
    artifactPath: taskArtifactPath(args.repoRoot, taskId, 'diagnosis'),
    decision,
  };
}
