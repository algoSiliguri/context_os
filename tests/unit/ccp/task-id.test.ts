import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allocateNextTaskId, currentTaskCounter } from '../../../src/ccp/task-id';

describe('task-id', () => {
  it('allocates T-001 on a fresh project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-tid-'));
    mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
    const id = allocateNextTaskId(dir);
    expect(id).toBe('T-001');
  });

  it('increments to T-002 after T-001', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-tid-'));
    mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
    expect(allocateNextTaskId(dir)).toBe('T-001');
    expect(allocateNextTaskId(dir)).toBe('T-002');
    expect(allocateNextTaskId(dir)).toBe('T-003');
  });

  it('persists counter to .agent-os/tasks/.next-id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-tid-'));
    mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
    allocateNextTaskId(dir);
    allocateNextTaskId(dir);
    const counter = readFileSync(join(dir, '.agent-os', 'tasks', '.next-id'), 'utf-8').trim();
    expect(counter).toBe('3');
  });

  it('currentTaskCounter reads without incrementing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-tid-'));
    mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
    expect(currentTaskCounter(dir)).toBe(1);
    allocateNextTaskId(dir);
    expect(currentTaskCounter(dir)).toBe(2);
  });
});
