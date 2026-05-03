import { readFileSync } from 'node:fs';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import YAML from 'yaml';
import { ProjectManifest, validateProjectManifest } from './models';

const TrustState = Type.Union([
  Type.Literal('trusted'),
  Type.Literal('untrusted'),
  Type.Literal('blocked'),
  Type.Literal('local-dev-only'),
  Type.Literal('requires-review'),
]);

const PolicyOverride = Type.Object({
  tool: Type.String(),
  when: Type.String(),
  tier: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)]),
});

export const ProjectConfig = Type.Composite([
  ProjectManifest,
  Type.Object({
    workspace: Type.Object({
      root: Type.String(),
    }),
    allowlist: Type.Optional(
      Type.Object({
        network: Type.Optional(Type.Array(Type.String())),
        commands: Type.Optional(Type.Array(Type.String())),
      }),
    ),
    overrides: Type.Optional(Type.Array(PolicyOverride)),
    break_glass: Type.Optional(
      Type.Object({
        enabled: Type.Boolean(),
      }),
    ),
    trust_registry: Type.Optional(
      Type.Object({
        pi_packages: Type.Optional(
          Type.Array(
            Type.Object({
              package: Type.String(),
              trust: TrustState,
            }),
          ),
        ),
        mcp_servers: Type.Optional(
          Type.Array(
            Type.Object({
              server: Type.String(),
              trust: TrustState,
            }),
          ),
        ),
      }),
    ),
  }),
]);
export type ProjectConfig = Static<typeof ProjectConfig>;

export function loadProjectConfig(path: string): ProjectConfig {
  const text = readFileSync(path, 'utf-8');
  const parsed = YAML.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('project config must be a mapping');
  }
  // Validate manifest part with the original semantic rules (blank critical actions, etc.)
  validateProjectManifest(parsed);
  if (!Value.Check(ProjectConfig, parsed)) {
    const errors = [...Value.Errors(ProjectConfig, parsed)];
    throw new Error(`invalid project config: ${errors[0]?.message ?? 'unknown'}`);
  }
  return parsed;
}
