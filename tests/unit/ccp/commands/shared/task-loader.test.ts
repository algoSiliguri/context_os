import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadTaskState,
  requireTaskState,
} from '../../../../../src/ccp/commands/shared/task-loader';
import { taskStatePath } from '../../../../../src/ccp/task-paths';

describe('task-loader', () => {
  function fixture(taskId: string, state: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'aos-tl-'));
    mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
    if (state !== null) {
      writeFileSync(
        taskStatePath(dir, taskId),
        JSON.stringify({ task_id: taskId, state }),
        'utf-8',
      );
    }
    return dir;
  }

  it('loadTaskState returns null when no state.json', () => {
    const dir = fixture('T-001', null);
    expect(loadTaskState(dir, 'T-001')).toBe(null);
  });

  it('loadTaskState returns the state string', () => {
    const dir = fixture('T-001', 'GRILLING');
    expect(loadTaskState(dir, 'T-001')).toBe('GRILLING');
  });

  it('requireTaskState throws when state mismatches', () => {
    const dir = fixture('T-001', 'NEW_IDEA');
    expect(() => requireTaskState(dir, 'T-001', ['SHARED_UNDERSTANDING'])).toThrow(
      /T-001 must be in SHARED_UNDERSTANDING/,
    );
  });

  it('requireTaskState passes when state matches', () => {
    const dir = fixture('T-001', 'SHARED_UNDERSTANDING');
    expect(() =>
      requireTaskState(dir, 'T-001', ['SHARED_UNDERSTANDING', 'PLANNING']),
    ).not.toThrow();
  });
});
