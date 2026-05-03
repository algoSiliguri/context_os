import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendJsonlEventAtomic,
  writeJsonAtomic,
  writeSessionSnapshot,
} from '../../src/core/session-store';

describe('session-store', () => {
  it('writeJsonAtomic creates the file with sorted, indented JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-store-'));
    const path = join(dir, 'session.json');
    writeJsonAtomic(path, { b: 2, a: 1 });
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('"a": 1');
    expect(content).toContain('"b": 2');
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('appendJsonlEventAtomic appends one line per call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-jsonl-'));
    const path = join(dir, 'events.jsonl');
    appendJsonlEventAtomic(path, { event_type: 'A' });
    appendJsonlEventAtomic(path, { event_type: 'B' });
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).event_type).toBe('A');
    expect(JSON.parse(lines[1]!).event_type).toBe('B');
  });

  it('writeSessionSnapshot writes a SessionBindingRecord JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-snap-'));
    const path = join(dir, 'session.json');
    writeSessionSnapshot(path, {
      session_id: 'sess-1',
      project_id: 'demo',
      runtime_version: '0.1.0',
      repo_root: dir,
      runtime_dir: join(dir, '.agent-os', 'runtime'),
      memory_namespace: 'demo',
      state: 'BOUND',
      effective_critical_actions: [],
      bound_at: '2026-05-03T14:00:00Z',
      verification_passed: ['C4'],
      verification_soft_failed: [],
      binding_degraded: false,
    });
    const obj = JSON.parse(readFileSync(path, 'utf-8'));
    expect(obj.session_id).toBe('sess-1');
  });
});
