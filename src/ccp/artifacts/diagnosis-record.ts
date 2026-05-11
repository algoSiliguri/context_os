import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

export const DiagnosisRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('DiagnosisRecord'),
    bug_summary: Type.String(),
    reported_behavior: Type.String(),
    expected_behavior: Type.String(),
    minimal_case: Type.String(),
    suspected_root_cause: Type.String(),
    confidence: Type.Union([
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high'),
    ]),
    decision: Type.Union([Type.Literal('proceed'), Type.Literal('blocked')]),
    open_blockers: Type.Array(Type.String()),
  }),
]);
export type DiagnosisRecord = Static<typeof DiagnosisRecord>;
