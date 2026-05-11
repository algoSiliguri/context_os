import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CheckpointResult {
  created: boolean;
  sha: string | null;
  dirtyFiles: string[];
  noGit: boolean;
  reason?: string;
}

export interface RestoreResult {
  restored: boolean;
  reason?: string;
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function getDirtyFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    return stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.slice(3).trim());
  } catch {
    return [];
  }
}

async function currentSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Creates a git stash checkpoint before /run.
 * Non-destructive: never modifies committed history.
 * If not a git repo, returns noGit=true (caller decides whether to block).
 */
export async function createCheckpoint(cwd: string, message: string): Promise<CheckpointResult> {
  if (!isGitRepo(cwd)) {
    return { created: false, sha: null, dirtyFiles: [], noGit: true, reason: 'not a git repo' };
  }

  const dirtyFiles = await getDirtyFiles(cwd);
  const sha = await currentSha(cwd);

  if (dirtyFiles.length === 0) {
    return { created: false, sha, dirtyFiles: [], noGit: false, reason: 'clean tree — no checkpoint needed' };
  }

  try {
    await execFileAsync('git', ['stash', 'push', '--include-untracked', '-m', message], { cwd });
    return { created: true, sha, dirtyFiles, noGit: false };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    return { created: false, sha, dirtyFiles, noGit: false, reason: `stash failed: ${msg}` };
  }
}

/**
 * Restore the most recent stash checkpoint (created by createCheckpoint).
 * Only pops the stash if it was created by Agent OS (matches message prefix).
 */
export async function restoreCheckpoint(cwd: string): Promise<RestoreResult> {
  if (!isGitRepo(cwd)) {
    return { restored: false, reason: 'not a git repo' };
  }
  try {
    const { stdout } = await execFileAsync('git', ['stash', 'list', '--format=%gs'], { cwd });
    const top = stdout.split('\n')[0]?.trim() ?? '';
    if (!top.includes('agent-os-checkpoint')) {
      return { restored: false, reason: `top stash not an agent-os checkpoint: "${top}"` };
    }
    await execFileAsync('git', ['stash', 'pop'], { cwd });
    return { restored: true };
  } catch (err: unknown) {
    return { restored: false, reason: (err as Error).message };
  }
}
