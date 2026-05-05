import { describe, expect, it } from 'vitest';
import {
  ALL_STATES,
  TaskState,
  isTerminal,
  transitionTask,
} from '../../../src/ccp/task-state-machine';

describe('task-state-machine', () => {
  it('exports 14 states', () => {
    expect(ALL_STATES).toHaveLength(14);
    expect(ALL_STATES).toContain(TaskState.NEW_IDEA);
    expect(ALL_STATES).toContain(TaskState.GRILLING);
    expect(ALL_STATES).toContain(TaskState.SHARED_UNDERSTANDING);
    expect(ALL_STATES).toContain(TaskState.PLANNING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_PLAN_APPROVAL);
    expect(ALL_STATES).toContain(TaskState.EXECUTING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_TOOL_APPROVAL);
    expect(ALL_STATES).toContain(TaskState.VERIFYING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_HUMAN_REVIEW);
    expect(ALL_STATES).toContain(TaskState.PERSISTING_KNOWLEDGE);
    expect(ALL_STATES).toContain(TaskState.COMPLETED);
    expect(ALL_STATES).toContain(TaskState.FAILED_RECOVERABLE);
    expect(ALL_STATES).toContain(TaskState.FAILED_BLOCKED);
    expect(ALL_STATES).toContain(TaskState.ABORTED);
  });

  it('NEW_IDEA → GRILLING is allowed', () => {
    expect(transitionTask(TaskState.NEW_IDEA, TaskState.GRILLING)).toBe(TaskState.GRILLING);
  });

  it('NEW_IDEA → EXECUTING is rejected', () => {
    expect(() => transitionTask(TaskState.NEW_IDEA, TaskState.EXECUTING)).toThrow(
      /invalid task transition/,
    );
  });

  it('EXECUTING ↔ AWAITING_TOOL_APPROVAL bidirectional', () => {
    expect(transitionTask(TaskState.EXECUTING, TaskState.AWAITING_TOOL_APPROVAL)).toBe(
      TaskState.AWAITING_TOOL_APPROVAL,
    );
    expect(transitionTask(TaskState.AWAITING_TOOL_APPROVAL, TaskState.EXECUTING)).toBe(
      TaskState.EXECUTING,
    );
  });

  it('VERIFYING → AWAITING_HUMAN_REVIEW (pass) or FAILED_RECOVERABLE (fail)', () => {
    expect(transitionTask(TaskState.VERIFYING, TaskState.AWAITING_HUMAN_REVIEW)).toBe(
      TaskState.AWAITING_HUMAN_REVIEW,
    );
    expect(transitionTask(TaskState.VERIFYING, TaskState.FAILED_RECOVERABLE)).toBe(
      TaskState.FAILED_RECOVERABLE,
    );
  });

  it('FAILED_RECOVERABLE → EXECUTING (resume)', () => {
    expect(transitionTask(TaskState.FAILED_RECOVERABLE, TaskState.EXECUTING)).toBe(
      TaskState.EXECUTING,
    );
  });

  it('any state can go to ABORTED', () => {
    for (const s of ALL_STATES) {
      if (s === TaskState.ABORTED || s === TaskState.COMPLETED) continue;
      expect(transitionTask(s, TaskState.ABORTED)).toBe(TaskState.ABORTED);
    }
  });

  it('COMPLETED is terminal', () => {
    expect(isTerminal(TaskState.COMPLETED)).toBe(true);
    expect(() => transitionTask(TaskState.COMPLETED, TaskState.NEW_IDEA)).toThrow();
  });

  it('ABORTED is terminal', () => {
    expect(isTerminal(TaskState.ABORTED)).toBe(true);
    expect(() => transitionTask(TaskState.ABORTED, TaskState.NEW_IDEA)).toThrow();
  });
});
