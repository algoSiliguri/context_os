import { type Static, Type } from '@sinclair/typebox';
import { ALL_STATES } from '../task-state-machine';
import { ArtifactEnvelope } from './envelope';

const StepStatus = Type.Union([
  Type.Literal('pending'),
  Type.Literal('running'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('skipped'),
]);

const Approval = Type.Object({
  tool: Type.String(),
  decided_by: Type.String(),
  at: Type.String(),
});

const StepFailure = Type.Union([
  Type.Null(),
  Type.Object({
    reason: Type.String(),
    summary: Type.String(),
    raw_output_ref: Type.Optional(Type.String()),
  }),
]);

const ExecutedStep = Type.Object({
  step_id: Type.String(),
  status: StepStatus,
  events: Type.Array(Type.String()),
  files_changed: Type.Array(Type.String()),
  commands_run: Type.Array(Type.String()),
  approvals: Type.Array(Approval),
  failure: StepFailure,
});

export const ExecutionRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('ExecutionRecord'),
    plan_id: Type.String(),
    harness: Type.String(),
    started_at: Type.String(),
    ended_at: Type.Optional(Type.String()),
    steps: Type.Array(ExecutedStep),
    final_state: Type.Union(ALL_STATES.map((s) => Type.Literal(s))),
  }),
]);
export type ExecutionRecord = Static<typeof ExecutionRecord>;
