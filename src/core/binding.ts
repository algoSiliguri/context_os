import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyRuntimeBundle } from './authority';
import { verifyConstitution } from './constitution';
import { loadProjectConfig } from './manifest';
import type { SessionBindingRecord } from './models';
import { runtimeDir } from './runtime-paths';
import { resolveRuntimeVersion } from './versioning';

const PROFILE_BASELINES: Record<string, string[]> = {
  default: [],
  sandbox: [],
  research: [],
  production: [],
};

export class BindingError extends Error {
  constructor(public condition: string, public detail: string) {
    super(detail);
    this.name = 'BindingError';
  }
}

export function resolveEffectiveCriticalActions(
  verificationProfile: string,
  criticalActions: string[],
): string[] {
  const baseline = PROFILE_BASELINES[verificationProfile] ?? [];
  return [...new Set([...baseline, ...criticalActions])].sort();
}

export interface BindOptions {
  skipBundleVerification?: boolean;
}

export async function bindProject(
  repoRoot: string,
  opts: BindOptions = {},
): Promise<SessionBindingRecord> {
  if (!opts.skipBundleVerification) {
    await verifyRuntimeBundle();
  }
  const config = loadProjectConfig(join(repoRoot, '.agent-os', 'project.yaml'));
  const effective = resolveEffectiveCriticalActions(
    config.verification_profile,
    config.critical_actions ?? [],
  );
  const result = verifyConstitution(repoRoot);
  if (result.hardFailed) {
    throw new BindingError(result.hardFailed, result.detail ?? 'Constitution verification failed.');
  }
  return {
    session_id: `sess-${randomUUID().slice(0, 12)}`,
    project_id: config.project_id,
    runtime_version: resolveRuntimeVersion(config.runtime_version),
    repo_root: repoRoot,
    runtime_dir: runtimeDir(repoRoot),
    memory_namespace: config.memory_namespace,
    state: 'BOUND',
    effective_critical_actions: effective,
    bound_at: new Date().toISOString(),
    verification_passed: result.passed,
    verification_soft_failed: result.softFailed,
    binding_degraded: result.softFailed.length > 0,
  };
}
