import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

export const ReviewRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('ReviewRecord'),
    status: Type.Union([
      Type.Literal('PASS'),
      Type.Literal('PASS_WITH_DEGRADATION'),
      Type.Literal('FAIL'),
      Type.Literal('BLOCKED'),
    ]),
    scope_drift: Type.Boolean(),
    scope_drift_severity: Type.Union([
      Type.Literal('no drift'),
      Type.Literal('minor drift'),
      Type.Literal('significant drift'),
    ]),
    notes: Type.Union([Type.String(), Type.Null()]),
    plan_step_count: Type.Union([Type.Number(), Type.String()]),
    verification_result: Type.String(),
  }),
]);
export type ReviewRecord = Static<typeof ReviewRecord>;
