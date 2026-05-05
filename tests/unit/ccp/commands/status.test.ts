import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runStatus } from '../../../../src/ccp/commands/status';
import { taskStatePath } from '../../../../src/ccp/task-paths';
import { initProjectionSchema } from '../../../../src/core/projection';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-st-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
    'utf-8',
  );
  writeFileSync(
    taskStatePath(dir, 'T-001'),
    JSON.stringify({ task_id: 'T-001', state: 'EXECUTING' }),
    'utf-8',
  );
  const db = new Database(join(dir, '.agent-os', 'runtime', 'projection.db'));
  initProjectionSchema(db);
  db.close();
  return dir;
}

describe('runStatus', () => {
  it('returns SessionStatus for the current task', async () => {
    const dir = fixture();
    const status = await runStatus({ repoRoot: dir });
    expect(status).not.toBeNull();
    expect(status!.task_id).toBe('T-001');
    expect(status!.current_state).toBe('EXECUTING');
  });

  it('returns null when there is no current task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-st-empty-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    expect(await runStatus({ repoRoot: dir })).toBeNull();
  });

  it('uses an explicit task_id arg when provided', async () => {
    const dir = fixture();
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-002'), { recursive: true });
    writeFileSync(
      taskStatePath(dir, 'T-002'),
      JSON.stringify({ task_id: 'T-002', state: 'COMPLETED' }),
      'utf-8',
    );
    const status = await runStatus({ repoRoot: dir, taskId: 'T-002' });
    expect(status!.task_id).toBe('T-002');
    expect(status!.current_state).toBe('COMPLETED');
  });
});

describe('runStatus next_action coverage', () => {
  const states: Array<{ state: string; needle: string }> = [
    { state: 'NEW_IDEA', needle: '/grill' },
    { state: 'GRILLING', needle: 'questions' },
    { state: 'SHARED_UNDERSTANDING', needle: '/plan' },
    { state: 'AWAITING_PLAN_APPROVAL', needle: 'approve' },
    { state: 'AWAITING_TOOL_APPROVAL', needle: 'approve' },
    { state: 'VERIFYING', needle: 'wait' },
    { state: 'AWAITING_HUMAN_REVIEW', needle: '/remember' },
    { state: 'PERSISTING_KNOWLEDGE', needle: 'capture' },
    { state: 'FAILED_RECOVERABLE', needle: '/run --resume' },
    { state: 'FAILED_BLOCKED', needle: 'replan' },
    { state: 'ABORTED', needle: 'aborted' },
  ];

  for (const { state, needle } of states) {
    it(`renders the right next_action for ${state}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), `aos-st-${state.toLowerCase()}-`));
      mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
      mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
      writeFileSync(
        taskStatePath(dir, 'T-001'),
        JSON.stringify({ task_id: 'T-001', state }),
        'utf-8',
      );
      const status = await runStatus({ repoRoot: dir, taskId: 'T-001' });
      expect(status?.next_action.toLowerCase()).toContain(needle.toLowerCase());
    });
  }
});
