import { describe, expect, it } from 'vitest';
import type { SessionDashboard } from '../../src/core/projector';
import { renderStatusToString } from '../../src/core/renderer';
import { renderDoctorReport } from '../../src/ccp/commands/doctor';

function baseDashboard(overrides: Partial<SessionDashboard> = {}): SessionDashboard {
  return {
    session_id: 's1',
    current_task_id: 'T-001',
    current_state: 'GRILLING',
    timeline: [],
    signals: {
      last_event_timestamp: new Date('2026-05-14T15:23:00.000Z').toISOString(),
      silent_failures: 0,
      loop_detected: false,
      repeated_queries: 0,
    },
    ...overrides,
  } as SessionDashboard;
}

const FIXED_NOW = new Date('2026-05-14T15:26:00.000Z').getTime();

describe('renderStatusToString — medium-density layout', () => {
  it('fresh task shows healthy + pack + phase + validators + memory + last event', () => {
    const dash = baseDashboard({
      active_pack: { id: 'engineering-core', version: '1.0.0', state: 'current' },
      phase_progress: { current: 4, total: 8, name: 'grill' },
      validator_outcomes: { passed: 4, failed: 0, warned: 0 },
      memory_pending: 0,
    });
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/T-001/);
      expect(out).toMatch(/GRILLING/);
      expect(out).toMatch(/engineering-core@1\.0\.0/);
      expect(out).toMatch(/current/);
      expect(out).toMatch(/4\/8/);
      expect(out).toMatch(/\[ok\] 4/);
      expect(out).toMatch(/\[x\] 0/);
      expect(out).toMatch(/0 candidates pending/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('stale pack shows stale badge with bundled version', () => {
    const dash = baseDashboard({
      active_pack: { id: 'engineering-core', version: '1.0.0', state: 'stale', bundled_version: '1.1.0' },
    });
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/stale/);
      expect(out).toMatch(/1\.1\.0/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('legacy dashboard with no active_pack still renders (backwards compat)', () => {
    const dash = baseDashboard();
    process.env.NO_COLOR = '1';
    try {
      const out = renderStatusToString('s1', dash, { nowMs: FIXED_NOW });
      expect(out).toMatch(/T-001/);
      expect(out).toMatch(/GRILLING/);
      expect(out).not.toMatch(/engineering-core/);
      // No Pack/Phase/Validators/Memory rows when fields are absent
      expect(out).not.toMatch(/Pack:/);
      expect(out).not.toMatch(/Validators:/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});

describe('renderDoctorReport — medium-density', () => {
  it('fresh-install shows all checks pass', () => {
    process.env.NO_COLOR = '1';
    try {
      const report = {
        status: 'ok' as const,
        checks: [
          { id: 'constitution', description: 'Constitution', label: 'Constitution', status: 'pass' as const, detail: 'present' },
          { id: 'project', description: 'Project config', label: 'Project config', status: 'pass' as const, detail: 'valid (project.yaml)' },
          {
            id: 'packs', description: 'Packs', label: 'Packs', status: 'pass' as const,
            packs: [
              { id: 'engineering-core', version: '1.0.0', state: 'current' as const, active: true },
            ],
          },
          { id: 'verify', description: 'Verification', label: 'Verification', status: 'pass' as const, detail: 'pytest detected (pyproject.toml)' },
        ],
      };
      const out = renderDoctorReport(report);
      expect(out).toMatch(/Agent OS doctor/);
      expect(out).toMatch(/engineering-core@1\.0\.0/);
      expect(out).toMatch(/Status: ok/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('stale pack shows recovery hint', () => {
    process.env.NO_COLOR = '1';
    try {
      const report = {
        status: 'soft_fail' as const,
        checks: [
          {
            id: 'packs', description: 'Packs', label: 'Packs', status: 'soft_fail' as const,
            packs: [
              { id: 'engineering-core', version: '1.0.0', state: 'stale' as const, bundled_version: '1.1.0', active: true },
            ],
          },
        ],
        hint: 'run /init --upgrade --force',
      };
      const out = renderDoctorReport(report);
      expect(out).toMatch(/stale/);
      expect(out).toMatch(/1\.1\.0/);
      expect(out).toMatch(/Status: soft_fail/);
      expect(out).toMatch(/Hint:.*init --upgrade --force/);
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
