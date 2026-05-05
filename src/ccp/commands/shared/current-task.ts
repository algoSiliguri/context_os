import { existsSync, readFileSync } from 'node:fs';
import { sessionSnapshotPath } from '../../../core/runtime-paths';
import { writeJsonAtomic } from '../../../core/session-store';

interface SessionSnapshot {
  session_id?: string;
  current_task_id?: string | null;
  [k: string]: unknown;
}

function readSnapshot(repoRoot: string): SessionSnapshot {
  const path = sessionSnapshotPath(repoRoot);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SessionSnapshot;
  } catch {
    return {};
  }
}

export function getCurrentTaskId(repoRoot: string): string | null {
  const snap = readSnapshot(repoRoot);
  return typeof snap.current_task_id === 'string' ? snap.current_task_id : null;
}

export function setCurrentTaskId(repoRoot: string, taskId: string): void {
  const snap = readSnapshot(repoRoot);
  snap.current_task_id = taskId;
  writeJsonAtomic(sessionSnapshotPath(repoRoot), snap);
}

export function clearCurrentTaskId(repoRoot: string): void {
  const snap = readSnapshot(repoRoot);
  snap.current_task_id = null;
  writeJsonAtomic(sessionSnapshotPath(repoRoot), snap);
}
