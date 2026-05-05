import { describe, expect, it } from 'vitest';
import { mcpServerTrust, piPackageTrust } from '../../../../src/ccp/policy/trust-registry';
import type { ProjectConfig } from '../../../../src/core/manifest';

const config: ProjectConfig = {
  project_id: 'p',
  domain_type: 'd',
  runtime_version: '0.1.0',
  memory_namespace: 'p',
  verification_profile: 'default',
  workspace: { root: '/repo' },
  trust_registry: {
    pi_packages: [
      { package: '@agnivadc/agent-os', trust: 'trusted' },
      { package: '@some/unknown', trust: 'requires-review' },
    ],
    mcp_servers: [{ server: 'knowledge-brain', trust: 'trusted' }],
  },
};

describe('trust-registry', () => {
  it('returns the registered trust for a known Pi package', () => {
    expect(piPackageTrust(config, '@agnivadc/agent-os')).toBe('trusted');
    expect(piPackageTrust(config, '@some/unknown')).toBe('requires-review');
  });

  it('returns "untrusted" for an unregistered Pi package', () => {
    expect(piPackageTrust(config, '@new/pkg')).toBe('untrusted');
  });

  it('returns the registered trust for a known MCP server', () => {
    expect(mcpServerTrust(config, 'knowledge-brain')).toBe('trusted');
  });

  it('returns "untrusted" for an unregistered MCP server', () => {
    expect(mcpServerTrust(config, 'random-server')).toBe('untrusted');
  });
});
