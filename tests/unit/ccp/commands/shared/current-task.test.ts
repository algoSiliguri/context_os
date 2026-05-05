import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearCurrentTaskId,
  getCurrentTaskId,
  setCurrentTaskId,
} from '../../../../../src/ccp/commands/shared/current-task';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-ct-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  return dir;
}

describe('current-task', () => {
  it('returns null when session.json does not exist', () => {
    const dir = fixture();
    expect(getCurrentTaskId(dir)).toBe(null);
  });

  it('returns null when session.json has no current_task_id', () => {
    const dir = fixture();
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1' }),
      'utf-8',
    );
    expect(getCurrentTaskId(dir)).toBe(null);
  });

  it('setCurrentTaskId then getCurrentTaskId round-trips', () => {
    const dir = fixture();
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1' }),
      'utf-8',
    );
    setCurrentTaskId(dir, 'T-001');
    expect(getCurrentTaskId(dir)).toBe('T-001');
  });

  it('clearCurrentTaskId nulls the field', () => {
    const dir = fixture();
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
      'utf-8',
    );
    clearCurrentTaskId(dir);
    expect(getCurrentTaskId(dir)).toBe(null);
  });

  it('returns null when session.json is malformed', () => {
    const dir = fixture();
    writeFileSync(join(dir, '.agent-os', 'runtime', 'session.json'), '{not json', 'utf-8');
    expect(getCurrentTaskId(dir)).toBe(null);
  });
});
