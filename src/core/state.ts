export const SessionState = {
  BOUND: 'BOUND',
  IDLE: 'IDLE',
  PLANNED: 'PLANNED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  EXECUTING: 'EXECUTING',
  EXECUTED: 'EXECUTED',
  VERIFIED: 'VERIFIED',
  REVIEWED: 'REVIEWED',
  COMPLETE: 'COMPLETE',
} as const;
export type SessionState = (typeof SessionState)[keyof typeof SessionState];

const ALLOWED: Record<SessionState, ReadonlySet<SessionState>> = {
  BOUND: new Set([SessionState.IDLE]),
  IDLE: new Set([SessionState.PLANNED]),
  PLANNED: new Set([SessionState.AWAITING_APPROVAL, SessionState.EXECUTING]),
  AWAITING_APPROVAL: new Set([SessionState.IDLE, SessionState.EXECUTING]),
  EXECUTING: new Set([SessionState.EXECUTED]),
  EXECUTED: new Set([SessionState.VERIFIED]),
  VERIFIED: new Set([SessionState.REVIEWED, SessionState.COMPLETE]),
  REVIEWED: new Set([SessionState.COMPLETE]),
  COMPLETE: new Set(),
};

export function transition(current: SessionState, target: SessionState): SessionState {
  if (!ALLOWED[current].has(target)) {
    throw new Error(`invalid transition: ${current} -> ${target}`);
  }
  return target;
}
