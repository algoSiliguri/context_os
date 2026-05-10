import { emitAndProject } from '../../core/projector';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { writeArtifact } from '../artifacts/io';
import {
  buildAnswerRecordedEvent,
  buildGrillStartedEvent,
  buildQuestionAskedEvent,
  buildSharedUnderstandingCreatedEvent,
  buildTaskCreatedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import { allocateNextTaskId } from '../task-id';
import { taskArtifactPath } from '../task-paths';
import { setCurrentTaskId } from './shared/current-task';
import { type QuestionGenerator, defaultQuestionGenerator } from './shared/question-generator';
import { writeTaskState } from './shared/task-loader';

export interface RunGrillArgs {
  repoRoot: string;
  sessionId: string;
  goal: string;
  userType: 'developer' | 'non_developer' | 'mixed';
  ui: UiAdapter;
  generator?: QuestionGenerator;
}

export interface GrillResult {
  taskId: string;
  artifactPath: string;
}

export async function runGrill(args: RunGrillArgs): Promise<GrillResult> {
  const taskId = allocateNextTaskId(args.repoRoot);
  setCurrentTaskId(args.repoRoot, taskId);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskCreatedEvent({
      sessionId: args.sessionId,
      taskId,
      goal: args.goal,
      userType: args.userType,
    }),
  );
  writeTaskState(args.repoRoot, taskId, 'NEW_IDEA', args.sessionId);
  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId,
      from: 'NEW_IDEA',
      to: 'GRILLING',
      triggeredBy: '/grill',
    }),
  );
  writeTaskState(args.repoRoot, taskId, 'GRILLING');
  emitAndProject(args.repoRoot, args.sessionId, buildGrillStartedEvent({ sessionId: args.sessionId, taskId }));

  const generator = args.generator ?? defaultQuestionGenerator();
  const priorAnswers: Array<{ category: string; answer: string }> = [];
  const questions: Array<{
    id: string;
    question: string;
    why_it_matters: string;
    answer?: string;
    status: 'answered';
  }> = [];
  let proceed = true;

  while (true) {
    const next = await generator.next({ goal: args.goal, priorAnswers });
    if (!next) break;

    const qId = `Q-${questions.length + 1}`;
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildQuestionAskedEvent({
        sessionId: args.sessionId,
        taskId,
        questionId: qId,
        question: next.question,
        whyItMatters: next.whyItMatters,
      }),
    );
    const answer = await args.ui.input(
      `[${next.category}] ${next.question}\n  (why: ${next.whyItMatters})\n  > `,
    );
    if (answer.trim().toLowerCase() === 'stop') {
      proceed = false;
      break;
    }
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildAnswerRecordedEvent({
        sessionId: args.sessionId,
        taskId,
        questionId: qId,
        answer,
      }),
    );
    questions.push({
      id: qId,
      question: next.question,
      why_it_matters: next.whyItMatters,
      answer,
      status: 'answered',
    });
    priorAnswers.push({ category: next.category, answer });
  }

  const env = makeEnvelope({ taskId, artifactType: 'GrillRecord' });
  const record = {
    ...env,
    artifact_type: 'GrillRecord' as const,
    goal: args.goal,
    user_type: args.userType,
    problem_statement: args.goal,
    assumptions: [],
    questions,
    risks: [],
    constraints: [],
    success_criteria: [],
    decision: {
      proceed,
      reason: proceed ? 'questions answered' : 'user stopped early',
    },
    open_blockers: [],
  };
  writeArtifact(args.repoRoot, taskId, 'grill', record);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildSharedUnderstandingCreatedEvent({
      sessionId: args.sessionId,
      taskId,
      decisionProceed: proceed,
    }),
  );
  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId,
      from: 'GRILLING',
      to: 'SHARED_UNDERSTANDING',
      triggeredBy: '/grill (done)',
    }),
  );
  writeTaskState(args.repoRoot, taskId, 'SHARED_UNDERSTANDING');

  return { taskId, artifactPath: taskArtifactPath(args.repoRoot, taskId, 'grill') };
}
