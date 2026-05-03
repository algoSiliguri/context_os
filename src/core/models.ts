import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const ProjectManifest = Type.Object({
  project_id: Type.String(),
  domain_type: Type.String(),
  runtime_version: Type.String(),
  memory_namespace: Type.String(),
  verification_profile: Type.String(),
  project_constitution: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  global_memory_read: Type.Optional(Type.Boolean()),
  global_memory_write: Type.Optional(Type.Boolean()),
  critical_actions: Type.Optional(Type.Array(Type.String())),
});
export type ProjectManifest = Static<typeof ProjectManifest>;

export const SessionBindingRecord = Type.Object({
  session_id: Type.String(),
  project_id: Type.String(),
  runtime_version: Type.String(),
  repo_root: Type.String(),
  runtime_dir: Type.String(),
  memory_namespace: Type.String(),
  state: Type.String(),
  effective_critical_actions: Type.Array(Type.String()),
  bound_at: Type.String(),
  verification_passed: Type.Optional(Type.Array(Type.String())),
  verification_soft_failed: Type.Optional(Type.Array(Type.String())),
  binding_degraded: Type.Optional(Type.Boolean()),
});
export type SessionBindingRecord = Static<typeof SessionBindingRecord>;

type ParsedManifest = Required<ProjectManifest>;

export function validateProjectManifest(input: unknown): ParsedManifest {
  if (!Value.Check(ProjectManifest, input)) {
    const errors = [...Value.Errors(ProjectManifest, input)];
    throw new Error(`invalid manifest: ${errors[0]?.message ?? 'unknown error'}`);
  }
  const critical = input.critical_actions ?? [];
  if (critical.some((a) => a.trim().length === 0)) {
    throw new Error('critical actions must not contain blanks');
  }
  return {
    project_id: input.project_id,
    domain_type: input.domain_type,
    runtime_version: input.runtime_version,
    memory_namespace: input.memory_namespace,
    verification_profile: input.verification_profile,
    project_constitution: input.project_constitution ?? null,
    global_memory_read: input.global_memory_read ?? true,
    global_memory_write: input.global_memory_write ?? false,
    critical_actions: critical,
  };
}
