import { type Static, Type } from '@sinclair/typebox';
import { ArtifactEnvelope } from './envelope';

export const QuickTaskRecord = Type.Intersect([
  ArtifactEnvelope,
  Type.Object({
    artifact_type: Type.Literal('QuickTaskRecord'),
    task_summary: Type.String(),
    files_changed: Type.Array(Type.String()),
    verification_command: Type.String(),
    status: Type.Union([
      Type.Literal('PASS_QUICK'),
      Type.Literal('FAIL'),
      Type.Literal('ESCALATED_TO_FULL_WORKFLOW'),
    ]),
  }),
]);
export type QuickTaskRecord = Static<typeof QuickTaskRecord>;
