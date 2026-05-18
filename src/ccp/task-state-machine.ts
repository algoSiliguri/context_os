export const TaskState = {
  NEW_IDEA: 'NEW_IDEA',
  DIAGNOSING: 'DIAGNOSING',
  GRILLING: 'GRILLING',
  SHARED_UNDERSTANDING: 'SHARED_UNDERSTANDING',
  PLANNING: 'PLANNING',
  AWAITING_PLAN_APPROVAL: 'AWAITING_PLAN_APPROVAL',
  QUICK_TASKING: 'QUICK_TASKING',
  EXECUTING: 'EXECUTING',
  AWAITING_TOOL_APPROVAL: 'AWAITING_TOOL_APPROVAL',
  VERIFYING: 'VERIFYING',
  AWAITING_HUMAN_REVIEW: 'AWAITING_HUMAN_REVIEW',
  EVALUATING: 'EVALUATING',
  PERSISTING_KNOWLEDGE: 'PERSISTING_KNOWLEDGE',
  COMPLETED: 'COMPLETED',
  FAILED_RECOVERABLE: 'FAILED_RECOVERABLE',
  FAILED_BLOCKED: 'FAILED_BLOCKED',
  ABORTED: 'ABORTED',
} as const;
export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export const ALL_STATES: ReadonlyArray<TaskState> = Object.values(TaskState);

const TERMINAL: ReadonlySet<TaskState> = new Set([TaskState.COMPLETED, TaskState.ABORTED]);

const HAPPY: Record<TaskState, ReadonlySet<TaskState>> = {
  NEW_IDEA: new Set([TaskState.GRILLING, TaskState.DIAGNOSING, TaskState.QUICK_TASKING]),
  DIAGNOSING: new Set([TaskState.SHARED_UNDERSTANDING, TaskState.FAILED_BLOCKED]),
  GRILLING: new Set([TaskState.SHARED_UNDERSTANDING, TaskState.FAILED_BLOCKED]),
  SHARED_UNDERSTANDING: new Set([TaskState.PLANNING]),
  PLANNING: new Set([TaskState.AWAITING_PLAN_APPROVAL, TaskState.FAILED_BLOCKED]),
  AWAITING_PLAN_APPROVAL: new Set([TaskState.EXECUTING, TaskState.SHARED_UNDERSTANDING]),
  QUICK_TASKING: new Set([TaskState.AWAITING_HUMAN_REVIEW, TaskState.FAILED_RECOVERABLE]),
  EXECUTING: new Set([
    TaskState.AWAITING_TOOL_APPROVAL,
    TaskState.VERIFYING,
    TaskState.FAILED_RECOVERABLE,
    TaskState.FAILED_BLOCKED,
  ]),
  AWAITING_TOOL_APPROVAL: new Set([TaskState.EXECUTING, TaskState.FAILED_BLOCKED]),
  VERIFYING: new Set([TaskState.AWAITING_HUMAN_REVIEW, TaskState.FAILED_RECOVERABLE]),
  AWAITING_HUMAN_REVIEW: new Set([
    TaskState.EVALUATING,
    TaskState.PERSISTING_KNOWLEDGE,
    TaskState.COMPLETED,
    TaskState.VERIFYING,
  ]),
  EVALUATING: new Set([TaskState.PERSISTING_KNOWLEDGE, TaskState.COMPLETED, TaskState.FAILED_RECOVERABLE]),
  PERSISTING_KNOWLEDGE: new Set([TaskState.COMPLETED]),
  COMPLETED: new Set(),
  FAILED_RECOVERABLE: new Set([
    TaskState.EXECUTING,
    TaskState.PLANNING,
    TaskState.VERIFYING,
    TaskState.QUICK_TASKING,
  ]),
  FAILED_BLOCKED: new Set([TaskState.PLANNING]),
  ABORTED: new Set(),
};

export function isTerminal(state: TaskState): boolean {
  return TERMINAL.has(state);
}

export function transitionTask(current: TaskState, target: TaskState): TaskState {
  if (TERMINAL.has(current)) {
    throw new Error(`invalid task transition: ${current} is terminal`);
  }
  if (target === TaskState.ABORTED) return target;
  if (!HAPPY[current].has(target)) {
    throw new Error(`invalid task transition: ${current} -> ${target}`);
  }
  return target;
}
