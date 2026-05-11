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

const CommandOutput = Type.Object({
  command: Type.String(),
  exit_code: Type.Number(),
  stdout: Type.String(),
  stderr: Type.String(),
  duration_ms: Type.Number(),
});

const ScopeResult = Type.Union([
  Type.Literal('exact_match'),
  Type.Literal('subset_match'),
  Type.Literal('extra_files_detected'),
  Type.Literal('missing_expected_changes'),
  Type.Literal('no_changes'),
  Type.Literal('non_git_unverifiable'),
]);

const ExecutedStep = Type.Object({
  step_id: Type.String(),
  status: StepStatus,
  events: Type.Array(Type.String()),
  files_changed: Type.Array(Type.String()),
  commands_run: Type.Array(Type.String()),
  command_outputs: Type.Optional(Type.Array(CommandOutput)),
  approvals: Type.Array(Approval),
  failure: StepFailure,
  scope_result: Type.Optional(ScopeResult),
  files_declared: Type.Optional(Type.Array(Type.String())),
  files_observed: Type.Optional(Type.Array(Type.String())),
  incidental_files: Type.Optional(Type.Array(Type.String())),
  scope_violation_reason: Type.Optional(Type.String()),
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
