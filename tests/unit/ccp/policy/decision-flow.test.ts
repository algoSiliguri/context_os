import { describe, expect, it } from 'vitest';
import {
  type SessionApprovalCache,
  decideToolCall,
} from '../../../../src/ccp/policy/decision-flow';
import { type ToolMetadata, ToolRegistry } from '../../../../src/ccp/policy/tool-registry';
import type { ProjectConfig } from '../../../../src/core/manifest';

const config: ProjectConfig = {
  project_id: 'p',
  domain_type: 'd',
  runtime_version: '0.1.0',
  memory_namespace: 'p',
  verification_profile: 'default',
  workspace: { root: '/repo' },
};

const writeFile: ToolMetadata = {
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

describe('decision-flow', () => {
  function setup() {
    const registry = new ToolRegistry();
    registry.register(writeFile);
    const cache: SessionApprovalCache = new Map();
    return { registry, cache };
  }

  it('unknown tool → block', () => {
    const { cache } = setup();
    const r = decideToolCall(
      { toolName: 'mystery', input: {} },
      { registry: new ToolRegistry(), cache, config },
    );
    expect(r.outcome).toBe('block');
    if (r.outcome === 'block') expect(r.reason).toContain('unknown');
  });

  it('Tier 1 → pass without prompt', () => {
    const { registry, cache } = setup();
    registry.register({
      ...writeFile,
      tool_id: 'read_file',
      capability_type: 'READ_LOCAL',
      approval_tier: 1,
      read_or_write: 'read',
    });
    const r = decideToolCall(
      { toolName: 'read_file', input: { path: '/repo/foo.ts' } },
      { registry, cache, config },
    );
    expect(r.outcome).toBe('pass');
  });

  it('Tier 2 first call → ask', () => {
    const { registry, cache } = setup();
    const r = decideToolCall(
      { toolName: 'write_file', input: { path: '/repo/foo.ts' } },
      { registry, cache, config },
    );
    expect(r.outcome).toBe('ask');
    if (r.outcome === 'ask') expect(r.tier).toBe(2);
  });

  it('Tier 2 cached → pass', () => {
    const { registry, cache } = setup();
    cache.set('write_file::path:string', true);
    const r = decideToolCall(
      { toolName: 'write_file', input: { path: '/repo/foo.ts' } },
      { registry, cache, config },
    );
    expect(r.outcome).toBe('pass');
  });

  it('Tier 3 always asks regardless of cache', () => {
    const { registry, cache } = setup();
    cache.set('write_file::path:string', true);
    const r = decideToolCall(
      { toolName: 'write_file', input: { path: '/elsewhere/foo.ts' } }, // outside workspace → tier 3
      { registry, cache, config },
    );
    expect(r.outcome).toBe('ask');
    if (r.outcome === 'ask') expect(r.tier).toBe(3);
  });

  it('Tier 4 → block by default', () => {
    const { registry, cache } = setup();
    const r = decideToolCall(
      { toolName: 'write_file', input: { command: 'sudo rm -rf /' } },
      { registry, cache, config },
    );
    expect(r.outcome).toBe('block');
    if (r.outcome === 'block') expect(r.tier).toBe(4);
  });

  it('Tier 4 with break_glass enabled → ask', () => {
    const { registry, cache } = setup();
    const breakGlassConfig: ProjectConfig = { ...config, break_glass: { enabled: true } };
    const r = decideToolCall(
      { toolName: 'write_file', input: { command: 'sudo apt' } },
      { registry, cache, config: breakGlassConfig },
    );
    expect(r.outcome).toBe('ask');
  });
});
