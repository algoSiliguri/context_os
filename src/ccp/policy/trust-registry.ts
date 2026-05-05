import type { ProjectConfig } from '../../core/manifest';

export type TrustLevel = 'trusted' | 'untrusted' | 'blocked' | 'local-dev-only' | 'requires-review';

export function piPackageTrust(config: ProjectConfig, packageName: string): TrustLevel {
  const entry = config.trust_registry?.pi_packages?.find((p) => p.package === packageName);
  return entry?.trust ?? 'untrusted';
}

export function mcpServerTrust(config: ProjectConfig, server: string): TrustLevel {
  const entry = config.trust_registry?.mcp_servers?.find((s) => s.server === server);
  return entry?.trust ?? 'untrusted';
}
