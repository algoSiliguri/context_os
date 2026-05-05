// src/ccp/artifacts/plan-artifact.ts
import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

const RiskTier = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical'),
]);

const ApprovalTier = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
]);

const ExpectedFile = Type.Object({
  path: Type.String(),
  operation: Type.Union([
    Type.Literal('read'),
    Type.Literal('create'),
    Type.Literal('modify'),
    Type.Literal('delete'),
  ]),
});

const PlannedCommand = Type.Object({
  command: Type.String(),
  approval_tier: ApprovalTier,
});

const PlannedVerification = Type.Object({
  command: Type.String(),
  expected_signal: Type.String(),
});

const PlanStep = Type.Object({
  id: Type.String(),
  title: Type.String(),
  purpose: Type.String(),
  expected_files: Type.Array(ExpectedFile),
  commands: Type.Array(PlannedCommand),
  verification: Type.Array(PlannedVerification),
  risk_tier: RiskTier,
  depends_on: Type.Array(Type.String()),
});

const ApprovalNote = Type.Object({
  id: Type.String(),
  reason: Type.String(),
});

export const PlanArtifact = Type.Composite([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('PlanArtifact'),
    source_grill_record: Type.String(),
    scope: Type.Object({
      in: Type.Array(Type.String()),
      out: Type.Array(Type.String()),
    }),
    steps: Type.Array(PlanStep),
    approval_required: Type.Array(ApprovalNote),
    rollback: Type.Object({ strategy: Type.String() }),
  }),
]);
export type PlanArtifact = Static<typeof PlanArtifact>;
