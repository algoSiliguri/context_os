import { execSync } from 'node:child_process';

export type EnsureResult = { status: 'already-installed' } | { status: 'installed' };

export interface EnsureBrainCliOptions {
  exec?: (cmd: string) => string;
}

const BRAIN_GIT = 'git+https://github.com/agnivadc/knowledge-brain.git';

function defaultExec(cmd: string): string {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
}

export function ensureBrainCli({ exec = defaultExec }: EnsureBrainCliOptions = {}): EnsureResult {
  try {
    exec('brain --version');
    return { status: 'already-installed' };
  } catch {
    // not installed; continue
  }
  try {
    exec('uv --version');
  } catch {
    throw new Error(
      'uv is not installed. Install it from https://docs.astral.sh/uv/getting-started/installation/ then re-run /init.',
    );
  }
  exec(`uv tool install --from ${BRAIN_GIT} knowledge-brain --reinstall`);
  return { status: 'installed' };
}
