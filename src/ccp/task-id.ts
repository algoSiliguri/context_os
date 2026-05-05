import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function counterPath(repoRoot: string): string {
  return join(repoRoot, '.agent-os', 'tasks', '.next-id');
}

function readCounter(repoRoot: string): number {
  const path = counterPath(repoRoot);
  if (!existsSync(path)) return 1;
  const raw = readFileSync(path, 'utf-8').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function writeCounter(repoRoot: string, value: number): void {
  const path = counterPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`, 'utf-8');
}

export function currentTaskCounter(repoRoot: string): number {
  return readCounter(repoRoot);
}

export function formatTaskId(n: number): string {
  return `T-${String(n).padStart(3, '0')}`;
}

export function allocateNextTaskId(repoRoot: string): string {
  const n = readCounter(repoRoot);
  writeCounter(repoRoot, n + 1);
  return formatTaskId(n);
}
