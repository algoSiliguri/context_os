import { describe, expect, it } from 'vitest';
import {
  buildBindingEvent,
  buildHeartbeatEvent,
  buildPermissionDeniedEvent,
  buildSkillLoadEvent,
  buildSkillUnloadEvent,
  buildStateTransitionEvent,
  buildToolApprovedEvent,
  buildToolDeniedEvent,
  buildToolRequestedEvent,
  buildViolationEvent,
} from '../../src/core/events';

describe('event builders', () => {
  const session = 'sess-abc';

  it('every event has the required envelope fields', () => {
    const e = buildBindingEvent({ sessionId: session, projectId: 'demo', state: 'BOUND' });
    expect(e.event_id).toMatch(/^[a-f0-9-]+$/);
    expect(e.event_type).toBe('BINDING');
    expect(e.session_id).toBe(session);
    expect(e.system_id).toBe('agent-os');
    expect(e.constitution_version).toBe('v2');
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(e.payload).toBeDefined();
  });

  it('STATE_TRANSITION carries to_state', () => {
    const e = buildStateTransitionEvent({ sessionId: session, toState: 'IDLE' });
    expect(e.event_type).toBe('STATE_TRANSITION');
    expect(e.payload).toEqual({ to_state: 'IDLE' });
  });

  it('TOOL_REQUESTED replaces ACTION_REQUESTED with same payload shape', () => {
    const e = buildToolRequestedEvent({
      sessionId: session,
      actionHash: 'h-1',
      capability: 'memory_write_global',
      paramsDigestSource: '{"a":1}',
      requestedAt: '2026-05-03T14:00:00Z',
      expiresAt: '2026-05-03T14:00:30Z',
    });
    expect(e.event_type).toBe('TOOL_REQUESTED');
    expect(e.payload).toMatchObject({
      action_hash: 'h-1',
      capability: 'memory_write_global',
      requested_at: '2026-05-03T14:00:00Z',
      expires_at: '2026-05-03T14:00:30Z',
    });
  });

  it('TOOL_DENIED supports the auto_rejected_ttl_expired reason', () => {
    const e = buildToolDeniedEvent({
      sessionId: session,
      actionHash: 'h-1',
      reason: 'auto_rejected_ttl_expired',
    });
    expect(e.event_type).toBe('TOOL_DENIED');
    expect(e.payload).toMatchObject({ action_hash: 'h-1', reason: 'auto_rejected_ttl_expired' });
  });

  it('HEARTBEAT has loaded_skills array', () => {
    const e = buildHeartbeatEvent({ sessionId: session, state: 'ACTIVE' });
    expect(e.payload).toMatchObject({
      state: 'ACTIVE',
      queue_depth: 0,
      loaded_skills: [],
    });
  });
});
