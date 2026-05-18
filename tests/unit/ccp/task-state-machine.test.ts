import { describe, expect, it } from 'vitest';
import {
  ALL_STATES,
  TaskState,
  isTerminal,
  transitionTask,
} from '../../../src/ccp/task-state-machine';

describe('task-state-machine', () => {
  it('exports 17 states', () => {
    expect(ALL_STATES).toHaveLength(17);
    expect(ALL_STATES).toContain(TaskState.NEW_IDEA);
    expect(ALL_STATES).toContain(TaskState.DIAGNOSING);
    expect(ALL_STATES).toContain(TaskState.GRILLING);
    expect(ALL_STATES).toContain(TaskState.SHARED_UNDERSTANDING);
    expect(ALL_STATES).toContain(TaskState.PLANNING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_PLAN_APPROVAL);
    expect(ALL_STATES).toContain(TaskState.QUICK_TASKING);
    expect(ALL_STATES).toContain(TaskState.EXECUTING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_TOOL_APPROVAL);
    expect(ALL_STATES).toContain(TaskState.VERIFYING);
    expect(ALL_STATES).toContain(TaskState.AWAITING_HUMAN_REVIEW);
    expect(ALL_STATES).toContain(TaskState.EVALUATING);
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

  it('AWAITING_HUMAN_REVIEW → VERIFYING is allowed (standalone /verify re-entry)', () => {
    expect(transitionTask(TaskState.AWAITING_HUMAN_REVIEW, TaskState.VERIFYING)).toBe(
      TaskState.VERIFYING,
    );
  });

  it('FAILED_RECOVERABLE → VERIFYING is allowed (standalone /verify re-entry)', () => {
    expect(transitionTask(TaskState.FAILED_RECOVERABLE, TaskState.VERIFYING)).toBe(
      TaskState.VERIFYING,
    );
  });
});

// Exhaustive characterization of the full HAPPY transition table.
// Re-declares the table as a test snapshot — if the source changes, this fails.
describe('HAPPY table: exhaustive characterization', () => {
  const S = TaskState;

  const EXPECTED_HAPPY: Record<TaskState, ReadonlySet<TaskState>> = {
    NEW_IDEA:                new Set([S.GRILLING, S.DIAGNOSING, S.QUICK_TASKING]),
    DIAGNOSING:              new Set([S.SHARED_UNDERSTANDING, S.FAILED_BLOCKED]),
    GRILLING:                new Set([S.SHARED_UNDERSTANDING, S.FAILED_BLOCKED]),
    SHARED_UNDERSTANDING:    new Set([S.PLANNING]),
    PLANNING:                new Set([S.AWAITING_PLAN_APPROVAL, S.FAILED_BLOCKED]),
    AWAITING_PLAN_APPROVAL:  new Set([S.EXECUTING, S.SHARED_UNDERSTANDING]),
    QUICK_TASKING:           new Set([S.AWAITING_HUMAN_REVIEW, S.FAILED_RECOVERABLE]),
    EXECUTING:               new Set([S.AWAITING_TOOL_APPROVAL, S.VERIFYING, S.FAILED_RECOVERABLE, S.FAILED_BLOCKED]),
    AWAITING_TOOL_APPROVAL:  new Set([S.EXECUTING, S.FAILED_BLOCKED]),
    VERIFYING:               new Set([S.AWAITING_HUMAN_REVIEW, S.FAILED_RECOVERABLE]),
    AWAITING_HUMAN_REVIEW:   new Set([S.EVALUATING, S.PERSISTING_KNOWLEDGE, S.COMPLETED, S.VERIFYING]),
    EVALUATING:              new Set([S.PERSISTING_KNOWLEDGE, S.COMPLETED, S.FAILED_RECOVERABLE]),
    PERSISTING_KNOWLEDGE:    new Set([S.COMPLETED]),
    COMPLETED:               new Set(),
    FAILED_RECOVERABLE:      new Set([S.EXECUTING, S.PLANNING, S.VERIFYING, S.QUICK_TASKING]),
    FAILED_BLOCKED:          new Set([S.PLANNING]),
    ABORTED:                 new Set(),
  };

  const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([S.COMPLETED, S.ABORTED]);
  const NON_TERMINAL = ALL_STATES.filter((s) => !TERMINAL_STATES.has(s));

  it('every allowed (from → to) pair succeeds', () => {
    for (const [from, targets] of Object.entries(EXPECTED_HAPPY) as [TaskState, ReadonlySet<TaskState>][]) {
      for (const to of targets) {
        expect(transitionTask(from as TaskState, to), `${from} → ${to}`).toBe(to);
      }
    }
  });

  it('every disallowed (from → to) pair throws', () => {
    for (const [from, allowed] of Object.entries(EXPECTED_HAPPY) as [TaskState, ReadonlySet<TaskState>][]) {
      if (TERMINAL_STATES.has(from as TaskState)) continue;
      const disallowed = ALL_STATES.filter(
        (to) => !allowed.has(to) && to !== S.ABORTED,
      );
      for (const to of disallowed) {
        expect(
          () => transitionTask(from as TaskState, to),
          `${from} → ${to} should throw`,
        ).toThrow(/invalid task transition/);
      }
    }
  });

  it('ABORTED target succeeds from every non-terminal state', () => {
    for (const from of NON_TERMINAL) {
      expect(transitionTask(from, S.ABORTED), `${from} → ABORTED`).toBe(S.ABORTED);
    }
  });

  it('COMPLETED throws on any outgoing transition', () => {
    for (const to of ALL_STATES) {
      expect(() => transitionTask(S.COMPLETED, to), `COMPLETED → ${to}`).toThrow(/terminal/);
    }
  });

  it('ABORTED throws on any outgoing transition', () => {
    for (const to of ALL_STATES) {
      expect(() => transitionTask(S.ABORTED, to), `ABORTED → ${to}`).toThrow(/terminal/);
    }
  });

  it('HAPPY table covers all 17 states', () => {
    expect(Object.keys(EXPECTED_HAPPY)).toHaveLength(17);
  });
});
