import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from '../../src/core/doctor';

describe('doctor', () => {
  it('reports missing constitution as a hard failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-dr-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const report = runDoctor(dir);
    expect(report.status).toBe('hard_fail');
    expect(report.checks.find((c) => c.id === 'constitution_exists')?.status).toBe('fail');
  });
});
