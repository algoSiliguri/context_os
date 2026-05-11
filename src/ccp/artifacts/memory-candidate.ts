import { type Static, Type } from '@sinclair/typebox';

export const MemoryCandidateStatus = Type.Union([
  Type.Literal('pending'),
  Type.Literal('approved'),
  Type.Literal('rejected'),
]);
export type MemoryCandidateStatus = Static<typeof MemoryCandidateStatus>;

export const MemoryCandidate = Type.Object({
  id: Type.String(),
  task_id: Type.String(),
  session_id: Type.String(),
  content: Type.String(),
  type: Type.Union([
    Type.Literal('decision'),
    Type.Literal('convention'),
    Type.Literal('command'),
    Type.Literal('warning'),
    Type.Literal('pattern'),
    Type.Literal('failure'),
    Type.Literal('architecture'),
  ]),
  scope: Type.Union([
    Type.Literal('session'),
    Type.Literal('project'),
    Type.Literal('global'),
  ]),
  evidence: Type.String(),
  status: MemoryCandidateStatus,
  staged_at: Type.String(),
  decided_at: Type.Optional(Type.String()),
  brain_node_id: Type.Optional(Type.String()),
});
export type MemoryCandidate = Static<typeof MemoryCandidate>;
