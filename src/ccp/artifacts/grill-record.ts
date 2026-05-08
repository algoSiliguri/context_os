import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

const Status = Type.Union([
  Type.Literal('untested'),
  Type.Literal('accepted'),
  Type.Literal('rejected'),
  Type.Literal('needs_evidence'),
  Type.Literal('answered'),
]);

const Severity = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical'),
]);

const Assumption = Type.Object({
  id: Type.String(),
  text: Type.String(),
  status: Status,
});

const Question = Type.Object({
  id: Type.String(),
  question: Type.String(),
  why_it_matters: Type.String(),
  answer: Type.Optional(Type.String()),
  status: Status,
});

const Risk = Type.Object({
  id: Type.String(),
  risk: Type.String(),
  severity: Severity,
  mitigation: Type.String(),
});

const Constraint = Type.Object({ id: Type.String(), text: Type.String() });
const SuccessCriterion = Type.Object({ id: Type.String(), text: Type.String() });
const Blocker = Type.Object({ id: Type.String(), blocker: Type.String() });

export const GrillRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('GrillRecord'),
    goal: Type.String(),
    user_type: Type.Union([
      Type.Literal('developer'),
      Type.Literal('non_developer'),
      Type.Literal('mixed'),
    ]),
    problem_statement: Type.String(),
    assumptions: Type.Array(Assumption),
    questions: Type.Array(Question),
    risks: Type.Array(Risk),
    constraints: Type.Array(Constraint),
    success_criteria: Type.Array(SuccessCriterion),
    decision: Type.Object({
      proceed: Type.Boolean(),
      reason: Type.String(),
    }),
    open_blockers: Type.Array(Blocker),
  }),
]);
export type GrillRecord = Static<typeof GrillRecord>;
