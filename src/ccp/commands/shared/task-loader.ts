import { existsSync, readFileSync } from 'node:fs';
import { writeJsonAtomic } from '../../../core/session-store';
import { taskStatePath } from '../../task-paths';

interface TaskStateRecord {
  task_id: string;
  state: string;
  updated_at: string;
  session_id?: string;
}

function readTaskRecord(repoRoot: string, taskId: string): TaskStateRecord | null {
  const path = taskStatePath(repoRoot, taskId);
  if (!existsSync(path)) return null;
  const obj = JSON.parse(readFileSync(path, 'utf-8'));
  return typeof obj.state === 'string' ? (obj as TaskStateRecord) : null;
}

export function loadTaskState(repoRoot: string, taskId: string): string | null {
  return readTaskRecord(repoRoot, taskId)?.state ?? null;
}

export function loadTaskSessionId(repoRoot: string, taskId: string): string | null {
  return readTaskRecord(repoRoot, taskId)?.session_id ?? null;
}

export function requireTaskState(repoRoot: string, taskId: string, allowed: string[]): string {
  const state = loadTaskState(repoRoot, taskId);
  if (state === null) {
    throw new Error(`task ${taskId} not found (no state.json)`);
  }
  if (!allowed.includes(state)) {
    throw new Error(`task ${taskId} must be in ${allowed.join(' | ')} (current: ${state})`);
  }
  return state;
}

// Called from task-lifecycle.ts (production) and test fixtures (setup only).
// Production callers: use transitionTaskLifecycle() instead of importing this directly.
export function writeTaskState(
  repoRoot: string,
  taskId: string,
  state: string,
  sessionId?: string,
): void {
  const existing = readTaskRecord(repoRoot, taskId);
  const record: TaskStateRecord = {
    task_id: taskId,
    state,
    updated_at: new Date().toISOString(),
    session_id: sessionId ?? existing?.session_id,
  };
  if (record.session_id === undefined) delete record.session_id;
  writeJsonAtomic(taskStatePath(repoRoot, taskId), record);
}
