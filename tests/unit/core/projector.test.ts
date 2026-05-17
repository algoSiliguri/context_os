import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../../src/core/events';
import { emitAndProject } from '../../../src/core/projector';
import { sessionDashboardPath, sessionEventsPath } from '../../../src/core/runtime-paths';
import * as sessionStore from '../../../src/core/session-store';

vi.mock('../../../src/core/session-store', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/session-store')>();
  return { ...real };
});

function makeEvent(sessionId: string): Event {
  return {
    event_id: 'test-event-id',
    event_type: 'TEST_CHARACTERIZATION',
    session_id: sessionId,
    trace_id: sessionId,
    span_id: 'test-span',
    parent_span_id: null,
    system_id: 'agent-os',
    constitution_version: 'v2',
    harness_id: 'test-harness',
    timestamp: '2026-01-01T00:00:00.000Z',
    payload: { marker: 'characterization' },
  };
}

describe('emitAndProject', () => {
  let repoRoot: string;
  const sessionId = 'test-session-001';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aos-projector-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes event to events.jsonl', () => {
    const event = makeEvent(sessionId);
    emitAndProject(repoRoot, sessionId, event);

    const eventsPath = sessionEventsPath(repoRoot, sessionId);
    expect(existsSync(eventsPath)).toBe(true);

    const lines = readFileSync(eventsPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event_type).toBe('TEST_CHARACTERIZATION');
    expect(parsed.event_id).toBe('test-event-id');
  });

  it('writes event to dashboard.json timeline', () => {
    const event = makeEvent(sessionId);
    emitAndProject(repoRoot, sessionId, event);

    const dashPath = sessionDashboardPath(repoRoot, sessionId);
    expect(existsSync(dashPath)).toBe(true);

    const dashboard = JSON.parse(readFileSync(dashPath, 'utf8'));
    expect(Array.isArray(dashboard.timeline)).toBe(true);
    const entry = dashboard.timeline.find(
      (e: { event_type: string }) => e.event_type === 'TEST_CHARACTERIZATION',
    );
    expect(entry).toBeDefined();
  });

  it('events.jsonl is written even when dashboard write throws', () => {
    vi.spyOn(sessionStore, 'writeJsonAtomic').mockImplementation(() => {
      throw new Error('dashboard write failed');
    });

    const event = makeEvent(sessionId);
    expect(() => emitAndProject(repoRoot, sessionId, event)).not.toThrow();

    const eventsPath = sessionEventsPath(repoRoot, sessionId);
    expect(existsSync(eventsPath)).toBe(true);
    const lines = readFileSync(eventsPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event_type).toBe('TEST_CHARACTERIZATION');
  });
});
