import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function runtimeRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..');
}

export async function verifyRuntimeBundle(): Promise<void> {
  const repoRoot = runtimeRepoRoot();
  try {
    await exec('python3', ['scripts/verify_agent_os_bundle.py'], { cwd: repoRoot });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const detail = err.stdout?.trim() || err.stderr?.trim() || 'runtime bundle verification failed';
    throw new Error(detail);
  }
}
