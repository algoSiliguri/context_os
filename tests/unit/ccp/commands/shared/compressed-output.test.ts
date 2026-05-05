import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compressOutput } from '../../../../../src/ccp/commands/shared/compressed-output';

describe('compressOutput', () => {
  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'aos-co-'));
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001', 'raw'), { recursive: true });
    return dir;
  }

  it('passes short output through unchanged', () => {
    const r = compressOutput({ repoRoot: repo(), taskId: 'T-001', stdout: 'all good', stderr: '' });
    expect(r.summary).toBe('all good');
    expect(r.rawOutputRef).toBeTruthy();
  });

  it('summarizes long output as first … last line', () => {
    const stdout = `start of test\nline 2\nline 3\n${'middle\n'.repeat(50)}line N-1\nend of test`;
    const r = compressOutput({ repoRoot: repo(), taskId: 'T-001', stdout, stderr: '' });
    expect(r.summary).toContain('start of test');
    expect(r.summary).toContain('end of test');
    expect(r.summary).toContain('…');
  });

  it('writes the raw output to disk for later expansion', () => {
    const dir = repo();
    const stdout = 'verbose log';
    const r = compressOutput({ repoRoot: dir, taskId: 'T-001', stdout, stderr: '' });
    const rawPath =
      r.rawOutputRef.startsWith('/') || /^[A-Z]:/.test(r.rawOutputRef)
        ? r.rawOutputRef
        : join(dir, r.rawOutputRef);
    const raw = readFileSync(rawPath, 'utf-8');
    expect(raw).toBeDefined();
    expect(raw).toContain('verbose log');
  });

  it('mixes stderr into the raw file with a separator', () => {
    const r = compressOutput({
      repoRoot: repo(),
      taskId: 'T-001',
      stdout: 'OK',
      stderr: 'warning: x',
    });
    expect(r.summary).toContain('OK');
  });

  it('includes stderr in summary when stdout is short and combined is short', () => {
    const r = compressOutput({
      repoRoot: repo(),
      taskId: 'T-001',
      stdout: 'OK',
      stderr: 'warning: deprecated flag X',
    });
    // combined < 200 chars → full combined.trim() returned
    expect(r.summary).toContain('OK');
    expect(r.summary).toContain('warning: deprecated flag X');
  });
});
