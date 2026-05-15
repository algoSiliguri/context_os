import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { bundledPacksSourceRoot } from '../ccp/commands/init/pack-installer';
import { compareSemver } from './semver';
import { verifyConstitution } from './constitution';
import { loadProjectConfig } from './manifest';

export interface DoctorPackItem {
  id: string;
  version: string;
  state: 'current' | 'stale' | 'newer' | 'unknown' | 'no-bundled';
  bundled_version?: string;
  active?: boolean;
}

export interface DoctorCheck {
  id: string;
  description: string;
  status: 'pass' | 'fail' | 'soft_fail';
  detail?: string;
  /** Optional structured pack data; used for the packs check row. */
  packs?: DoctorPackItem[];
  /** Optional human-readable label (overrides description for display). */
  label?: string;
}

export interface DoctorReport {
  status: 'ok' | 'soft_fail' | 'hard_fail';
  checks: DoctorCheck[];
  /** Optional recovery hint shown when status is soft_fail. */
  hint?: string;
}

/** Read the `version` field from a workflow-pack.yaml. Returns null on any error. */
function readPackVersion(manifestPath: string): string | null {
  try {
    if (!existsSync(manifestPath)) return null;
    const raw = YAML.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const v = raw?.version;
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export interface PackVersionDetail {
  packId: string;
  installedVersion: string | null;
  bundledVersion: string | null;
  /** 'current' | 'stale' | 'newer' | 'unknown' | 'no-bundled' */
  state: 'current' | 'stale' | 'newer' | 'unknown' | 'no-bundled';
  detail: string;
}

/** Visible for testing — compares installed vs bundled version for a single pack. */
export function resolvePackVersionDetail(
  packId: string,
  installedManifestPath: string,
  bundledManifestPath: string,
): PackVersionDetail {
  const installedVersion = readPackVersion(installedManifestPath);
  const bundledVersion = readPackVersion(bundledManifestPath);

  if (!installedVersion) {
    return { packId, installedVersion, bundledVersion, state: 'unknown', detail: `${packId} (version unknown)` };
  }
  if (!bundledVersion) {
    return { packId, installedVersion, bundledVersion, state: 'no-bundled', detail: `${packId} v${installedVersion}` };
  }

  const cmp = compareSemver(installedVersion, bundledVersion);
  if (cmp === null) {
    return { packId, installedVersion, bundledVersion, state: 'unknown', detail: `${packId} (version unknown)` };
  }
  if (cmp < 0) {
    return {
      packId, installedVersion, bundledVersion, state: 'stale',
      detail: `${packId} v${installedVersion} is older than bundled v${bundledVersion} — run /init --upgrade --force`,
    };
  }
  if (cmp > 0) {
    return {
      packId, installedVersion, bundledVersion, state: 'newer',
      detail: `${packId} v${installedVersion} (newer than bundled v${bundledVersion})`,
    };
  }
  return { packId, installedVersion, bundledVersion, state: 'current', detail: `${packId} v${installedVersion} (current)` };
}

export interface RunDoctorOptions {
  /** Override the bundled packs source root for testing. Defaults to bundledPacksSourceRoot(). */
  bundledPacksRoot?: string;
}

export function runDoctor(repoRoot: string, opts: RunDoctorOptions = {}): DoctorReport {
  const resolvedBundledPacksRoot = opts.bundledPacksRoot ?? bundledPacksSourceRoot();
  const checks: DoctorCheck[] = [];

  const constitutionPath = join(repoRoot, 'AGENT_OS_CONSTITUTION.md');
  if (!existsSync(constitutionPath)) {
    checks.push({
      id: 'constitution_exists',
      description: 'AGENT_OS_CONSTITUTION.md exists',
      status: 'fail',
      detail: `Not found at ${constitutionPath}`,
    });
    return { status: 'hard_fail', checks };
  }
  checks.push({
    id: 'constitution_exists',
    description: 'AGENT_OS_CONSTITUTION.md exists',
    status: 'pass',
  });

  const verify = verifyConstitution(repoRoot);
  if (verify.hardFailed) {
    checks.push({
      id: 'constitution_verify',
      description: 'Constitution binding conditions',
      status: 'fail',
      detail: `${verify.hardFailed}: ${verify.detail ?? ''}`,
    });
    return { status: 'hard_fail', checks };
  }
  checks.push({
    id: 'constitution_verify',
    description: 'Constitution binding conditions',
    status: verify.softFailed.length > 0 ? 'soft_fail' : 'pass',
    detail: verify.softFailed.length > 0 ? `soft: ${verify.softFailed.join(', ')}` : undefined,
  });

  const projectYaml = join(repoRoot, '.agent-os', 'project.yaml');
  if (!existsSync(projectYaml)) {
    checks.push({
      id: 'project_yaml_exists',
      description: '.agent-os/project.yaml exists',
      status: 'fail',
      detail: `Not found at ${projectYaml}`,
    });
    return { status: 'hard_fail', checks };
  }
  try {
    loadProjectConfig(projectYaml);
    checks.push({
      id: 'project_yaml_valid',
      description: '.agent-os/project.yaml parses and validates',
      status: 'pass',
    });
  } catch (e) {
    checks.push({
      id: 'project_yaml_valid',
      description: '.agent-os/project.yaml parses and validates',
      status: 'fail',
      detail: (e as Error).message,
    });
    return { status: 'hard_fail', checks };
  }

  const resolvedDbPath =
    process.env.BRAIN_DB_PATH ?? join(repoRoot, 'data_store', 'knowledge.db');
  const dbReachable = existsSync(resolvedDbPath);
  checks.push({
    id: 'brain_db_path',
    description: 'Brain DB is reachable',
    status: dbReachable ? 'pass' : 'soft_fail',
    detail: dbReachable
      ? undefined
      : `Brain DB not found at ${resolvedDbPath}. Run: brain --db-path "${resolvedDbPath}" init`,
  });

  const manifestPath = join(repoRoot, '.agent-os', 'install-manifest.json');
  if (!existsSync(manifestPath)) {
    checks.push({
      id: 'install_manifest',
      description: '.agent-os/install-manifest.json exists',
      status: 'soft_fail',
      detail: `Not found at ${manifestPath}. Run: bash setup.sh`,
    });
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const required = ['installed_at', 'knowledge_brain_version', 'agent_os_extension', 'brain_db_path'];
      const missing = required.filter((k) => !manifest[k]);
      if (missing.length > 0) {
        checks.push({
          id: 'install_manifest',
          description: '.agent-os/install-manifest.json is valid',
          status: 'soft_fail',
          detail: `Missing fields: ${missing.join(', ')}. Re-run setup.sh`,
        });
      } else {
        checks.push({
          id: 'install_manifest',
          description: '.agent-os/install-manifest.json is valid',
          status: 'pass',
          detail: `Installed at ${manifest.installed_at}, extension: ${manifest.agent_os_extension}`,
        });
      }
    } catch {
      checks.push({
        id: 'install_manifest',
        description: '.agent-os/install-manifest.json is valid',
        status: 'soft_fail',
        detail: 'File exists but could not parse JSON. Re-run setup.sh',
      });
    }
  }

  const packsDir = join(repoRoot, '.agent-os', 'packs');
  if (!existsSync(packsDir)) {
    checks.push({
      id: 'workflow_packs',
      description: 'Workflow packs installed',
      status: 'soft_fail',
      detail: 'No packs installed. Run: /init --upgrade',
    });
  } else {
    let validPacks: string[] = [];
    try {
      validPacks = readdirSync(packsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(packsDir, d.name, 'workflow-pack.yaml')))
        .map((d) => d.name);
    } catch { /* best-effort */ }

    if (validPacks.length === 0) {
      checks.push({
        id: 'workflow_packs',
        description: 'Workflow packs installed',
        status: 'soft_fail',
        detail: 'Packs directory exists but no valid packs found. Run: /init --upgrade',
      });
    } else {
      // Check each installed pack's version against the bundled version.
      const packDetails: string[] = [];
      const packItems: DoctorPackItem[] = [];
      let anyStale = false;

      for (const packId of validPacks) {
        const pvd = resolvePackVersionDetail(
          packId,
          join(packsDir, packId, 'workflow-pack.yaml'),
          join(resolvedBundledPacksRoot, packId, 'workflow-pack.yaml'),
        );
        packDetails.push(pvd.detail);
        if (pvd.state === 'stale' || pvd.state === 'unknown') {
          anyStale = true;
        }
        packItems.push({
          id: packId,
          version: pvd.installedVersion ?? 'unknown',
          state: pvd.state,
          bundled_version: pvd.bundledVersion ?? undefined,
          active: true,
        });
      }

      checks.push({
        id: 'workflow_packs',
        description: 'Workflow packs installed',
        status: anyStale ? 'soft_fail' : 'pass',
        detail: packDetails.join('; '),
        packs: packItems,
      });
    }
  }

  const hasSoft = checks.some((c) => c.status === 'soft_fail');
  return { status: hasSoft ? 'soft_fail' : 'ok', checks };
}
