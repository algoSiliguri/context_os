import { describe, expect, it } from 'vitest';
import { SessionState, transition } from '../../src/core/state';

describe('state', () => {
  it('BOUND → IDLE is allowed', () => {
    expect(transition(SessionState.BOUND, SessionState.IDLE)).toBe(SessionState.IDLE);
  });

  it('BOUND → EXECUTING is rejected', () => {
    expect(() => transition(SessionState.BOUND, SessionState.EXECUTING)).toThrow(
      /invalid transition/,
    );
  });

  it('COMPLETE has no outgoing transitions', () => {
    expect(() => transition(SessionState.COMPLETE, SessionState.IDLE)).toThrow();
  });

  it('PLANNED → AWAITING_APPROVAL or PLANNED → EXECUTING are both allowed', () => {
    expect(transition(SessionState.PLANNED, SessionState.AWAITING_APPROVAL)).toBe(
      SessionState.AWAITING_APPROVAL,
    );
    expect(transition(SessionState.PLANNED, SessionState.EXECUTING)).toBe(SessionState.EXECUTING);
  });
});
