import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDoctorReport, runDoctorCommand } from '../../../../src/ccp/commands/doctor';

describe('runDoctorCommand', () => {
  it('reports hard_fail on a fresh dir with no constitution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-dr-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const report = await runDoctorCommand({ repoRoot: dir });
    expect(report.status).toBe('hard_fail');
  });
});

describe('renderDoctorReport', () => {
  it('renders pass/fail/soft_fail markers', () => {
    process.env.NO_COLOR = '1';
    try {
      const out = renderDoctorReport({
        status: 'soft_fail',
        checks: [
          { id: 'a', description: 'A check', status: 'pass' },
          { id: 'b', description: 'B check', status: 'soft_fail', detail: 'C10 missing' },
          { id: 'c', description: 'C check', status: 'fail', detail: 'thing broken' },
        ],
      });
      expect(out).toContain('[ok]');
      expect(out).toContain('[!]');
      expect(out).toContain('[x]');
      expect(out).toContain('thing broken');
      expect(out).toContain('soft_fail');
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
