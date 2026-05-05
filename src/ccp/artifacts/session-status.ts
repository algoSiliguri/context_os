import { type Static, Type } from '@sinclair/typebox';

const PendingApproval = Type.Object({
  tool: Type.String(),
  path: Type.Optional(Type.String()),
});

const LastEvent = Type.Union([
  Type.Null(),
  Type.Object({
    event_type: Type.String(),
    age_seconds: Type.Number(),
  }),
]);

export const SessionStatus = Type.Object({
  task_id: Type.String(),
  current_state: Type.String(),
  current_step: Type.String(),
  risk_tier: Type.String(),
  pending_approvals: Type.Array(PendingApproval),
  last_meaningful_event: LastEvent,
  next_action: Type.String(),
});
export type SessionStatus = Static<typeof SessionStatus>;

export function makeSessionStatus(args: {
  taskId: string;
  currentState: string;
  currentStep: string;
  riskTier: string;
  pendingApprovals: Array<{ tool: string; path?: string }>;
  lastMeaningfulEvent: { event_type: string; age_seconds: number } | null;
  nextAction: string;
}): SessionStatus {
  return {
    task_id: args.taskId,
    current_state: args.currentState,
    current_step: args.currentStep,
    risk_tier: args.riskTier,
    pending_approvals: args.pendingApprovals.map((a) => ({
      tool: a.tool,
      ...(a.path !== undefined ? { path: a.path } : {}),
    })),
    last_meaningful_event: args.lastMeaningfulEvent,
    next_action: args.nextAction,
  };
}
