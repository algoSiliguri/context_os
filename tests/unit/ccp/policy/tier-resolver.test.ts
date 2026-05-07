import { describe, expect, it } from 'vitest';
import { resolveEffectiveTier } from '../../../../src/ccp/policy/tier-resolver';
import type { ToolMetadata } from '../../../../src/ccp/policy/tool-registry';
import type { ProjectConfig } from '../../../../src/core/manifest';

const baseConfig: ProjectConfig = {
  project_id: 'p',
  domain_type: 'd',
  runtime_version: '0.1.0',
  memory_namespace: 'p',
  verification_profile: 'default',
  workspace: { root: '/repo' },
};

const baseTool: ToolMetadata = {
  tool_id: 'write_file',
  source: 'pi',
  trust_level: 'trusted',
  capability_type: 'WRITE_LOCAL',
  read_or_write: 'write',
  network_required: false,
  workspace_required: true,
  approval_tier: 2,
  audit_metadata: {},
  retry_policy: 'idempotent',
  idempotency_key_support: false,
};

describe('tier-resolver', () => {
  it('returns base tier when no overrides apply', () => {
    expect(resolveEffectiveTier(baseTool, { path: '/repo/src/foo.ts' }, baseConfig)).toBe(2);
  });

  it('escalates to 4 when input matches sudo pattern', () => {
    expect(
      resolveEffectiveTier(
        { ...baseTool, tool_id: 'run_command', capability_type: 'EXECUTE_LOCAL' },
        { command: 'sudo apt-get install x' },
        baseConfig,
      ),
    ).toBe(4);
  });

  it('escalates to 4 when reading .env path', () => {
    expect(
      resolveEffectiveTier(
        { ...baseTool, tool_id: 'read_file', capability_type: 'READ_LOCAL', approval_tier: 1 },
        { path: '/repo/.env' },
        baseConfig,
      ),
    ).toBe(4);
  });

  it('escalates to 3 when path is outside workspace', () => {
    expect(resolveEffectiveTier(baseTool, { path: '/elsewhere/file.txt' }, baseConfig)).toBe(3);
  });

  it('floors override at compiled baseline — override tier 1 on tier-2 tool returns 2', () => {
    const config: ProjectConfig = {
      ...baseConfig,
      overrides: [{ tool: 'write_file', when: 'path within workspace.root', tier: 1 }],
    };
    expect(resolveEffectiveTier(baseTool, { path: '/repo/src/foo.ts' }, config)).toBe(2);
  });

  it('floors override at compiled baseline — override tier 1 on tier-3 tool returns 3', () => {
    const tier3Tool: ToolMetadata = { ...baseTool, tool_id: 'exec', approval_tier: 3 };
    const config: ProjectConfig = {
      ...baseConfig,
      overrides: [{ tool: 'exec', when: 'path within workspace.root', tier: 1 }],
    };
    expect(resolveEffectiveTier(tier3Tool, { path: '/repo/src/foo.ts' }, config)).toBe(3);
  });

  it('allows override to raise tier above baseline — override tier 4 on tier-1 tool returns 4', () => {
    const tier1Tool: ToolMetadata = { ...baseTool, tool_id: 'read_file', approval_tier: 1 };
    const config: ProjectConfig = {
      ...baseConfig,
      overrides: [{ tool: 'read_file', when: 'matches "^/secrets"', tier: 4 }],
    };
    expect(resolveEffectiveTier(tier1Tool, { command: '/secrets/key' }, config)).toBe(4);
  });

  it('uses regex override to bump to 3', () => {
    const config: ProjectConfig = {
      ...baseConfig,
      overrides: [{ tool: 'run_command', when: 'matches "^git push"', tier: 3 }],
    };
    expect(
      resolveEffectiveTier(
        { ...baseTool, tool_id: 'run_command' },
        { command: 'git push origin main' },
        config,
      ),
    ).toBe(3);
  });
});
