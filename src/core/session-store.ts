import { mkdirSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SessionBindingRecord } from './models';

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJsonAtomic(path: string, payload: unknown): void {
  ensureDir(path);
  const tempPath = `${path}.tmp`;
  const text = JSON.stringify(sortKeys(payload), null, 2) + '\n';
  writeFileSync(tempPath, text, 'utf-8');
  renameSync(tempPath, path);
}

export function appendJsonlEventAtomic(path: string, payload: unknown): void {
  ensureDir(path);
  const line = JSON.stringify(sortKeys(payload)) + '\n';
  appendFileSync(path, line, 'utf-8');
}

export function writeSessionSnapshot(path: string, record: SessionBindingRecord): void {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}
