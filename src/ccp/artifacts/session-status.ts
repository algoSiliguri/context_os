import { type Static, Type } from '@sinclair/typebox';
import { ALL_STATES, type TaskState } from '../task-state-machine';

type RiskTier = 'low' | 'medium' | 'high' | 'critical';

const RiskTierSchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical'),
]);

const TaskStateSchema = Type.Union(ALL_STATES.map((s) => Type.Literal(s)));

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
  current_state: TaskStateSchema,
  current_step: Type.String(),
  risk_tier: RiskTierSchema,
  pending_approvals: Type.Array(PendingApproval),
  last_meaningful_event: LastEvent,
  next_action: Type.String(),
});
export type SessionStatus = Static<typeof SessionStatus>;

export function makeSessionStatus(args: {
  taskId: string;
  currentState: TaskState;
  currentStep: string;
  riskTier: RiskTier;
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
