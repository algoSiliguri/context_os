import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDoctorReport, runDoctorCommand } from '../src/ccp/commands/doctor';
import { runInit } from '../src/ccp/commands/init';
import type { UiAdapter } from '../src/pi/ui';

type RepoInfo = {
  name: string;
  path: string;
  version: string;
  commit: string;
  branch: string;
  dirty: boolean;
};

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentOsRoot = resolve(join(__dirname, '..'));

function shell(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function findWorkspaceRoot(): string {
  const parent = dirname(agentOsRoot);
  if (
    existsSync(join(parent, 'Agent_OS')) &&
    existsSync(join(parent, 'agent-os-starter')) &&
    existsSync(join(parent, 'knowledge-brain'))
  ) {
    return parent;
  }
  const cwd = process.cwd();
  if (
    existsSync(join(cwd, 'Agent_OS')) &&
    existsSync(join(cwd, 'agent-os-starter')) &&
    existsSync(join(cwd, 'knowledge-brain'))
  ) {
    return cwd;
  }
  throw new Error(
    `Could not find sibling repos. Run from parent folder or Agent_OS. Checked ${parent} and ${cwd}.`,
  );
}

function repoInfo(name: string, path: string): RepoInfo {
  const packageJson = join(path, 'package.json');
  const pyproject = join(path, 'pyproject.toml');
  let version = 'unknown';
  if (existsSync(packageJson)) {
    version = String(readJson(packageJson).version ?? 'unknown');
  } else if (existsSync(pyproject)) {
    const text = readFileSync(pyproject, 'utf8');
    version = text.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? 'unknown';
  }
  return {
    name,
    path,
    version,
    commit: shell('git rev-parse --short HEAD', path),
    branch: shell('git branch --show-current', path) || 'detached',
    dirty: shell('git status --short', path).length > 0,
  };
}

function printRepo(info: RepoInfo): void {
  console.log(
    `  ${info.name}: v${info.version} ${info.commit} ${info.branch}${info.dirty ? ' dirty' : ' clean'}`,
  );
  console.log(`    path: ${info.path}`);
}

function ui(): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => '',
    select: async (_msg, choices) => choices[0] ?? '',
  };
}

function runLocalBrain(knowledgeBrainRoot: string, dbPath: string, uvCacheDir: string): void {
  const env = { ...process.env, UV_CACHE_DIR: uvCacheDir };
  execFileSync('uv', ['run', 'brain', '--version'], {
    cwd: knowledgeBrainRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  execFileSync('uv', ['run', 'brain', '--db-path', dbPath, 'init'], {
    cwd: knowledgeBrainRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  execFileSync(
    'uv',
    [
      'run',
      'brain',
      '--db-path',
      dbPath,
      'write',
      'Agent OS local developer smoke test memory',
      '--tags',
      'agent-os,dev-smoke',
      '--source-type',
      'session',
      '--source-ref',
      'Agent_OS/scripts/dev-smoke.ts',
    ],
    { cwd: knowledgeBrainRoot, env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );
  execFileSync('uv', ['run', 'brain', '--db-path', dbPath, 'list', '--limit', '1'], {
    cwd: knowledgeBrainRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

async function main(): Promise<void> {
  const keep = process.argv.includes('--keep');
  const workspaceRoot = findWorkspaceRoot();
  const repos = {
    agentOs: join(workspaceRoot, 'Agent_OS'),
    starter: join(workspaceRoot, 'agent-os-starter'),
    knowledgeBrain: join(workspaceRoot, 'knowledge-brain'),
  };
  const runRoot = mkdtempSync(join(tmpdir(), 'agent-os-dev-smoke-'));
  const piHome = join(runRoot, 'pi-agent');
  const uvCacheDir = join(runRoot, 'uv-cache');
  const binDir = join(runRoot, 'bin');
  const projectRoot = join(runRoot, 'project');
  const brainDb = join(projectRoot, 'data_store', 'knowledge.db');
  const checks: Check[] = [];

  console.log('Agent OS local developer smoke');
  console.log(`workspace: ${workspaceRoot}`);
  console.log(`run root:  ${runRoot}`);
  console.log('');
  console.log('Local sources:');
  printRepo(repoInfo('Agent_OS', repos.agentOs));
  printRepo(repoInfo('agent-os-starter', repos.starter));
  printRepo(repoInfo('knowledge-brain', repos.knowledgeBrain));
  console.log('');

  try {
    mkdirSync(piHome, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(projectRoot, 'data_store'), { recursive: true });
    writeFileSync(
      join(piHome, 'settings.json'),
      `${JSON.stringify({ packages: [repos.agentOs] }, null, 2)}\n`,
    );

    process.env.PI_CODING_AGENT_DIR = piHome;
    process.env.BRAIN_DB_PATH = brainDb;
    process.env.AGENT_OS_LOCAL_DEV = '1';
    process.env.UV_CACHE_DIR = uvCacheDir;
    writeFileSync(
      join(binDir, 'brain'),
      `#!/usr/bin/env bash\nexec uv --directory "${repos.knowledgeBrain}" run brain "$@"\n`,
    );
    chmodSync(join(binDir, 'brain'), 0o755);
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`;

    console.log('Isolated profile:');
    console.log(`  PI_CODING_AGENT_DIR=${piHome}`);
    console.log(`  BRAIN_DB_PATH=${brainDb}`);
    console.log(`  Pi package source=${repos.agentOs}`);
    console.log('');

    checks.push({
      name: 'Pi profile points at local Agent_OS',
      ok:
        JSON.stringify(readJson(join(piHome, 'settings.json')).packages) ===
        JSON.stringify([repos.agentOs]),
    });

    try {
      runLocalBrain(repos.knowledgeBrain, brainDb, uvCacheDir);
      checks.push({ name: 'local knowledge-brain CLI init/write/list', ok: true });
    } catch (e) {
      checks.push({
        name: 'local knowledge-brain CLI init/write/list',
        ok: false,
        detail: (e as Error).message,
      });
    }

    const logs: string[] = [];
    const init = await runInit({
      rest: 'agent-os-dev-smoke --no-prompt --pack engineering-core',
      targetRoot: projectRoot,
      ui: ui(),
      log: (msg) => logs.push(msg),
      sourceRoot: repos.agentOs,
      packsSourceRoot: join(repos.agentOs, 'src', 'ccp', 'commands', 'init', 'packs'),
      exec: (cmd) => {
        if (cmd === 'brain --version') return 'knowledge-brain local-dev';
        throw new Error(`dev smoke blocked unexpected command: ${cmd}`);
      },
    });
    checks.push({
      name: '/init from local Agent_OS source',
      ok: init.ok,
      detail: init.ok ? undefined : logs.at(-1),
    });

    writeFileSync(
      join(projectRoot, '.agent-os', 'install-manifest.json'),
      `${JSON.stringify(
        {
          schema_version: 1,
          installed_at: new Date().toISOString(),
          installer_version: 'dev-smoke',
          agent_os_package: '@agnivadc/agent-os',
          agent_os_version: repoInfo('Agent_OS', repos.agentOs).version,
          agent_os_source: repos.agentOs,
          agent_os_resolved_path: repos.agentOs,
          agent_os_extension: repos.agentOs,
          install_mode: 'local-dev',
          knowledge_brain_version: repoInfo('knowledge-brain', repos.knowledgeBrain).version,
          knowledge_brain_source: repos.knowledgeBrain,
          knowledge_brain_path: repos.knowledgeBrain,
          agent_os_commit: repoInfo('Agent_OS', repos.agentOs).commit,
          brain_db_path: brainDb,
          pi_agent_dir: piHome,
        },
        null,
        2,
      )}\n`,
    );

    const doctor = await runDoctorCommand({ repoRoot: projectRoot });
    console.log('Doctor report:');
    console.log(renderDoctorReport(doctor));
    console.log('');
    checks.push({
      name: '/doctor status is ok',
      ok: doctor.status === 'ok',
      detail: doctor.status,
    });
    checks.push({
      name: 'disposable project has project-local brain DB',
      ok: existsSync(brainDb),
      detail: brainDb,
    });
    checks.push({
      name: 'disposable project has governance files',
      ok:
        existsSync(join(projectRoot, 'AGENT_OS_CONSTITUTION.md')) &&
        existsSync(join(projectRoot, '.agent-os', 'project.yaml')) &&
        existsSync(
          join(projectRoot, '.agent-os', 'packs', 'engineering-core', 'workflow-pack.yaml'),
        ),
    });
  } finally {
    console.log('Results:');
    for (const check of checks) {
      console.log(
        `  ${check.ok ? '[ok]' : '[FAIL]'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`,
      );
    }
    const failed = checks.filter((check) => !check.ok);
    if (keep) {
      console.log('');
      console.log(`Kept smoke directory: ${runRoot}`);
    } else {
      rmSync(runRoot, { recursive: true, force: true });
      console.log('');
      console.log(`Cleaned smoke directory: ${runRoot}`);
    }
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(`dev smoke failed: ${(e as Error).message}`);
  process.exit(1);
});
