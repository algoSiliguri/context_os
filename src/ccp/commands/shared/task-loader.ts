import { existsSync, readFileSync } from 'node:fs';
import { writeJsonAtomic } from '../../../core/session-store';
import { taskStatePath } from '../../task-paths';

export function loadTaskState(repoRoot: string, taskId: string): string | null {
  const path = taskStatePath(repoRoot, taskId);
  if (!existsSync(path)) return null;
  const obj = JSON.parse(readFileSync(path, 'utf-8'));
  return typeof obj.state === 'string' ? obj.state : null;
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

export function writeTaskState(repoRoot: string, taskId: string, state: string): void {
  writeJsonAtomic(taskStatePath(repoRoot, taskId), {
    task_id: taskId,
    state,
    updated_at: new Date().toISOString(),
  });
}
