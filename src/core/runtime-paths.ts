import { join } from 'node:path';

export function runtimeDir(repoRoot: string): string {
  return join(repoRoot, '.agent-os', 'runtime');
}

export function lockPath(repoRoot: string): string {
  return join(repoRoot, '.agent-os.lock');
}

export function eventLogPath(repoRoot: string): string {
  return join(runtimeDir(repoRoot), 'events.jsonl');
}

export function sessionSnapshotPath(repoRoot: string): string {
  return join(runtimeDir(repoRoot), 'session.json');
}
