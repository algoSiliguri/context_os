import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { LockRecord } from '../../src/core/lock';

describe('LockRecord schema', () => {
  it('accepts a valid record', () => {
    const valid = {
      session_id: 'sess-1',
      project_id: 'demo',
      repo_root: '/repo',
      log_path: '/repo/.agent-os/runtime/events.jsonl',
    };
    expect(Value.Check(LockRecord, valid)).toBe(true);
  });

  it('rejects a record missing required fields', () => {
    expect(Value.Check(LockRecord, { session_id: 'sess-1' })).toBe(false);
  });

  it('rejects non-string field types', () => {
    const bad = {
      session_id: 'sess-1',
      project_id: 'demo',
      repo_root: 123,
      log_path: '/x',
    };
    expect(Value.Check(LockRecord, bad)).toBe(false);
  });
});
