import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

export const EvaluationRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('EvaluationRecord'),
    task_outcome: Type.Union([
      Type.Literal('PASS'),
      Type.Literal('PASS_WITH_DEGRADATION'),
      Type.Literal('FAIL'),
    ]),
    criteria_satisfaction_rate: Type.Number({ minimum: 0, maximum: 1 }),
    total_criteria: Type.Number({ minimum: 0 }),
    verification_result: Type.String(),
    review_status: Type.String(),
    process_quality: Type.Union([
      Type.Literal('high'),
      Type.Literal('medium'),
      Type.Literal('low'),
    ]),
    notes: Type.Union([Type.String(), Type.Null()]),
  }),
]);
export type EvaluationRecord = Static<typeof EvaluationRecord>;
