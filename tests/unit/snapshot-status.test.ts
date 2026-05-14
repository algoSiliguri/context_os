import { describe, expect, it } from 'vitest';
import type { SessionDashboard } from '../../src/core/projector';
import { renderStatusToString } from '../../src/core/renderer';

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
