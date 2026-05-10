import { describe, expect, it } from 'vitest';
import { classifyHealth, ageLabel, timeLabel } from '../../../src/core/health';
import type { SessionDashboard } from '../../../src/core/projector';

function dashboard(overrides: Partial<SessionDashboard> = {}): SessionDashboard {
  return {
    session_id: 'sess-1',
    last_updated: new Date().toISOString(),
    current_state: null,
    current_task_id: null,
    timeline: [],
    signals: {
      loop_detected: false,
      silent_failures: 0,
      repeated_queries: 0,
      last_event_timestamp: null,
      transition_counts: {},
      query_counts: {},
    },
    ...overrides,
  };
}

const NOW = 1_000_000_000_000; // fixed epoch for deterministic tests

describe('classifyHealth', () => {
  it('returns HEALTHY when no state set', () => {
    expect(classifyHealth(dashboard(), NOW)).toBe('HEALTHY');
  });

  it('returns DONE for COMPLETED', () => {
    expect(classifyHealth(dashboard({ current_state: 'COMPLETED' }), NOW)).toBe('DONE');
  });

  it('returns DONE for ABORTED', () => {
    expect(classifyHealth(dashboard({ current_state: 'ABORTED' }), NOW)).toBe('DONE');
  });

  it('returns FAILED for FAILED_BLOCKED', () => {
    expect(classifyHealth(dashboard({ current_state: 'FAILED_BLOCKED' }), NOW)).toBe('FAILED');
  });

  it('returns FAILED for FAILED_RECOVERABLE', () => {
    expect(classifyHealth(dashboard({ current_state: 'FAILED_RECOVERABLE' }), NOW)).toBe('FAILED');
  });

  it('returns LOOPING when loop_detected is true', () => {
    expect(
      classifyHealth(
        dashboard({ current_state: 'EXECUTING', signals: { loop_detected: true, silent_failures: 0, repeated_queries: 0, last_event_timestamp: null, transition_counts: {}, query_counts: {} } }),
        NOW,
      ),
    ).toBe('LOOPING');
  });

  it('returns STUCK when last event is over 90s ago in active state', () => {
    const staleTs = new Date(NOW - 91_000).toISOString();
    expect(
      classifyHealth(
        dashboard({
          current_state: 'EXECUTING',
          signals: { loop_detected: false, silent_failures: 0, repeated_queries: 0, last_event_timestamp: staleTs, transition_counts: {}, query_counts: {} },
        }),
        NOW,
      ),
    ).toBe('STUCK');
  });

  it('returns HEALTHY when last event is recent', () => {
    const freshTs = new Date(NOW - 10_000).toISOString();
    expect(
      classifyHealth(
        dashboard({
          current_state: 'EXECUTING',
          signals: { loop_detected: false, silent_failures: 0, repeated_queries: 0, last_event_timestamp: freshTs, transition_counts: {}, query_counts: {} },
        }),
        NOW,
      ),
    ).toBe('HEALTHY');
  });
});

describe('ageLabel', () => {
  it('shows seconds for recent events', () => {
    expect(ageLabel(new Date(NOW - 30_000).toISOString(), NOW)).toBe('30s ago');
  });

  it('shows minutes for older events', () => {
    expect(ageLabel(new Date(NOW - 120_000).toISOString(), NOW)).toBe('2m ago');
  });

  it('returns "never" for null', () => {
    expect(ageLabel(null)).toBe('never');
  });
});

describe('timeLabel', () => {
  it('extracts HH:MM:SS from ISO string', () => {
    expect(timeLabel('2026-05-10T08:50:10.000Z')).toBe('08:50:10');
  });
});
