import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

const RunCommand = Type.Object({
  command: Type.String(),
  run_at: Type.String(),
  exit_code: Type.Number(),
  summary: Type.String(),
  raw_output_ref: Type.Optional(Type.String()),
});

const Result = Type.Union([Type.Literal('pass'), Type.Literal('fail'), Type.Literal('blocked')]);

export const VerificationRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('VerificationRecord'),
    commands: Type.Array(RunCommand),
    result: Result,
    next_action: Type.Union([Type.Null(), Type.String()]),
  }),
]);
export type VerificationRecord = Static<typeof VerificationRecord>;
