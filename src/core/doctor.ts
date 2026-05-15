import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; detail?: string } {
  const result = spawnSync(command, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    detail: result.status !== null ? `exit ${result.status}` : result.error?.message,
  };
}

function findExecutable(name: string): string | null {
  const result = runCommand('which', [name]);
  return result.ok && result.stdout ? result.stdout.split('\n')[0] ?? null : null;
}

function findPackageRoot(start: string): string {
  let dir = start;
  for (;;) {
    const packageJson = join(dir, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
        if (pkg?.name === '@agnivadc/agent-os') return dir;
      } catch { /* keep walking */ }
    }
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function agentOsPackageRoot(): string {
  return findPackageRoot(dirname(fileURLToPath(import.meta.url)));
}

function readAgentOsVersion(packageRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function gitCommit(packageRoot: string): string | null {
  const result = runCommand('git', ['-C', packageRoot, 'rev-parse', '--short', 'HEAD']);
  return result.ok && result.stdout ? result.stdout : null;
}

function piAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
}

function readConfiguredPiSources(): string[] {
  const settingsPath = join(piAgentDir(), 'settings.json');
  if (!existsSync(settingsPath)) return [];
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const packages = Array.isArray(settings.packages) ? settings.packages : [];
    return packages
      .map((pkg: unknown) => typeof pkg === 'string'
        ? pkg
        : typeof pkg === 'object' && pkg !== null && 'source' in pkg
          ? (pkg as { source?: unknown }).source
          : undefined)
      .filter((source: unknown): source is string => typeof source === 'string' && source.length > 0);
  } catch {
    return [];
  }
}

function inferSourceMode(packageRoot: string): { mode: string; source?: string } {
  const sources = readConfiguredPiSources();
  const root = resolve(packageRoot);
  const source = sources.find((candidate) => {
    if (candidate.startsWith('git:') || candidate.startsWith('npm:')) return false;
    try {
      return resolve(candidate) === root;
    } catch {
      return false;
    }
  }) ?? sources.find((candidate) => candidate.includes('Agent_OS') || candidate.includes('@agnivadc/agent-os'));

  if (process.env.AGENT_OS_DEV_HOME || process.env.AGENT_OS_LOCAL_DEV === '1') return { mode: 'local-dev', source };
  if (source && (source.startsWith('/') || source.startsWith('.') || source.startsWith('~'))) return { mode: 'local-path', source };
  if (source?.startsWith('git:') || source?.includes('github.com')) return { mode: 'git', source };
  if (source?.startsWith('npm:') || packageRoot.includes('node_modules')) return { mode: 'released-package', source };
  return { mode: 'unknown', source };
}

function addProvenanceChecks(checks: DoctorCheck[]): void {
  const piPath = findExecutable('pi');
  checks.push({
    id: 'pi_executable',
    description: 'Pi executable path',
    status: piPath ? 'pass' : 'soft_fail',
    detail: piPath ?? 'pi not found on PATH. Repair: npm install -g @earendil-works/pi-coding-agent',
  });

  const piVersion = piPath ? runCommand('pi', ['--version']) : null;
  checks.push({
    id: 'pi_version',
    description: 'Pi version',
    status: piVersion?.ok ? 'pass' : 'soft_fail',
    detail: piVersion?.ok ? (piVersion.stdout || piVersion.stderr || 'version output was empty') : 'Could not run pi --version. Repair: npm install -g @earendil-works/pi-coding-agent@latest',
  });

  const packageRoot = agentOsPackageRoot();
  const source = inferSourceMode(packageRoot);
  checks.push({
    id: 'agent_os_package',
    description: 'Agent_OS package',
    status: 'pass',
    detail: `version ${readAgentOsVersion(packageRoot)}, path ${packageRoot}`,
  });
  checks.push({
    id: 'agent_os_source',
    description: 'Agent_OS source mode',
    status: source.mode === 'unknown' ? 'soft_fail' : 'pass',
    detail: `${source.mode}${source.source ? `, source ${source.source}` : ''}${source.mode === 'unknown' ? '. Repair: run bash setup.sh from agent-os-starter, which reads agent-os-install.env for the intended install ref' : ''}`,
  });
  checks.push({
    id: 'agent_os_git_commit',
    description: 'Agent_OS git commit',
    status: gitCommit(packageRoot) ? 'pass' : 'soft_fail',
    detail: gitCommit(packageRoot) ?? 'Not inside a git checkout or git unavailable',
  });

  const brainPath = findExecutable('brain');
  checks.push({
    id: 'knowledge_brain_executable',
    description: 'knowledge-brain executable',
    status: brainPath ? 'pass' : 'soft_fail',
    detail: brainPath ?? 'brain not found on PATH. Repair: uv tool install --from git+https://github.com/agnivadc/knowledge-brain.git@v1.0.1 knowledge-brain --reinstall',
  });
  const brainVersion = brainPath ? runCommand('brain', ['--version']) : null;
  const brainVersionDetail = brainVersion?.ok
    ? brainVersion.stdout
    : `brain --version failed${brainVersion?.detail ? ` (${brainVersion.detail})` : ''}${brainVersion?.stderr ? `: ${brainVersion.stderr}` : ''}. Repair: uv tool install --from git+https://github.com/agnivadc/knowledge-brain.git@v1.0.1 knowledge-brain --reinstall`;
  checks.push({
    id: 'knowledge_brain_version',
    description: 'knowledge-brain version',
    status: brainVersion?.ok ? 'pass' : 'soft_fail',
    detail: brainVersionDetail,
  });
}

export function runDoctor(repoRoot: string, opts: RunDoctorOptions = {}): DoctorReport {
  const resolvedBundledPacksRoot = opts.bundledPacksRoot ?? bundledPacksSourceRoot();
  const checks: DoctorCheck[] = [];
  addProvenanceChecks(checks);

  const agentOsDir = join(repoRoot, '.agent-os');
  checks.push({
    id: 'project_initialized',
    description: 'Project initialized',
    status: existsSync(agentOsDir) ? 'pass' : 'fail',
    detail: existsSync(agentOsDir) ? undefined : `Not initialized. Repair: run /init from Pi in ${repoRoot}`,
  });

  checks.push({
    id: 'runtime_dir',
    description: '.agent-os/runtime exists',
    status: existsSync(join(agentOsDir, 'runtime')) ? 'pass' : 'soft_fail',
    detail: existsSync(join(agentOsDir, 'runtime')) ? undefined : 'Missing runtime directory. Repair: run /init --upgrade',
  });

  checks.push({
    id: 'tasks_dir',
    description: '.agent-os/tasks exists',
    status: existsSync(join(agentOsDir, 'tasks')) ? 'pass' : 'soft_fail',
    detail: existsSync(join(agentOsDir, 'tasks')) ? undefined : 'Missing tasks directory. Repair: run /init --upgrade',
  });

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
    description: 'knowledge-brain DB path',
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
      const required = [
        'schema_version',
        'installed_at',
        'installer_version',
        'agent_os_package',
        'agent_os_version',
        'agent_os_source',
        'knowledge_brain_version',
        'knowledge_brain_source',
        'brain_db_path',
        'pi_agent_dir',
        'install_mode',
      ];
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
          detail: `mode ${manifest.install_mode}, Agent_OS ${manifest.agent_os_version} from ${manifest.agent_os_source}`,
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
