import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

// A single recorded sub-phase outcome (phased /diagnose flow).
export const DiagnosePhaseRecord = Type.Object({
  id: Type.String(),
  exit_condition: Type.String(),
  satisfied: Type.Boolean(),
  user_note: Type.Optional(Type.String()),
});
export type DiagnosePhaseRecord = Static<typeof DiagnosePhaseRecord>;

export const FalsifiableHypothesis = Type.Object({
  id: Type.String(),
  statement: Type.String(),  // expected to contain "if … then …"
  rank: Type.Number(),
});
export type FalsifiableHypothesis = Static<typeof FalsifiableHypothesis>;

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
    // ── additive Phase 1 fields (phased flow only) ─────────────────────────
    phases: Type.Optional(Type.Array(DiagnosePhaseRecord)),
    hypotheses: Type.Optional(Type.Array(FalsifiableHypothesis)),
    feedback_loop: Type.Optional(Type.String()),         // which mechanism (e.g., "curl", "failing test")
    instrumentation_tag: Type.Optional(Type.String()),   // e.g., "[DEBUG-a4f2]"
  }),
]);
export type DiagnosisRecord = Static<typeof DiagnosisRecord>;
