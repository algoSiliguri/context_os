import { describe, expect, it } from 'vitest';
import {
  buildBindingEvent,
  buildHeartbeatEvent,
  buildPermissionDeniedEvent,
  buildPhaseBlockedEvent,
  buildPhaseCompletedEvent,
  buildPhaseFailedEvent,
  buildPhaseStartedEvent,
  buildPolicyDecisionEvent,
  buildSkillLoadEvent,
  buildSkillUnloadEvent,
  buildStateTransitionEvent,
  buildToolApprovedEvent,
  buildToolDeniedEvent,
  buildToolRequestedEvent,
  buildValidatorFailedEvent,
  buildValidatorPassedEvent,
  buildValidatorStartedEvent,
  buildViolationEvent,
  buildWorkflowPackLoadFailedEvent,
  buildWorkflowPackLoadedEvent,
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

describe('core/events remaining builders: event_type, session_id, timestamp', () => {
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const s = 'sess-char';

  it('WORKFLOW_PACK_LOADED', () => {
    const e = buildWorkflowPackLoadedEvent({ sessionId: s, packId: 'p-1', packVersion: '1.0.0', packDir: '/tmp/p', phaseCount: 3 });
    expect(e.event_type).toBe('WORKFLOW_PACK_LOADED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ pack_id: 'p-1', pack_version: '1.0.0', phase_count: 3 });
  });

  it('WORKFLOW_PACK_LOAD_FAILED', () => {
    const e = buildWorkflowPackLoadFailedEvent({ sessionId: s, packDir: '/tmp/p', error: 'not found' });
    expect(e.event_type).toBe('WORKFLOW_PACK_LOAD_FAILED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ pack_dir: '/tmp/p', error: 'not found' });
  });

  it('PHASE_STARTED', () => {
    const e = buildPhaseStartedEvent({ sessionId: s, packId: 'p-1', phaseId: 'ph-1' });
    expect(e.event_type).toBe('PHASE_STARTED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ pack_id: 'p-1', phase_id: 'ph-1' });
  });

  it('PHASE_COMPLETED', () => {
    const e = buildPhaseCompletedEvent({ sessionId: s, packId: 'p-1', phaseId: 'ph-1', nextAllowedPhases: ['ph-2'] });
    expect(e.event_type).toBe('PHASE_COMPLETED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ phase_id: 'ph-1', next_allowed_phases: ['ph-2'] });
  });

  it('PHASE_FAILED', () => {
    const e = buildPhaseFailedEvent({ sessionId: s, packId: 'p-1', phaseId: 'ph-1', reason: 'timeout' });
    expect(e.event_type).toBe('PHASE_FAILED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ phase_id: 'ph-1', reason: 'timeout' });
  });

  it('PHASE_BLOCKED_PREDECESSOR', () => {
    const e = buildPhaseBlockedEvent({ sessionId: s, packId: 'p-1', phaseId: 'ph-2', missingPredecessors: ['ph-1'] });
    expect(e.event_type).toBe('PHASE_BLOCKED_PREDECESSOR');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ phase_id: 'ph-2', missing_predecessors: ['ph-1'] });
  });

  it('VALIDATOR_STARTED', () => {
    const e = buildValidatorStartedEvent({ sessionId: s, packId: 'p-1', validatorId: 'v-1', phaseId: 'ph-1', mode: 'blocking' });
    expect(e.event_type).toBe('VALIDATOR_STARTED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ validator_id: 'v-1', mode: 'blocking' });
  });

  it('VALIDATOR_PASSED', () => {
    const e = buildValidatorPassedEvent({ sessionId: s, packId: 'p-1', validatorId: 'v-1', phaseId: 'ph-1' });
    expect(e.event_type).toBe('VALIDATOR_PASSED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ validator_id: 'v-1', phase_id: 'ph-1' });
  });

  it('VALIDATOR_FAILED', () => {
    const e = buildValidatorFailedEvent({ sessionId: s, packId: 'p-1', validatorId: 'v-1', phaseId: 'ph-1', mode: 'advisory', findings: ['f1'] });
    expect(e.event_type).toBe('VALIDATOR_FAILED');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ validator_id: 'v-1', mode: 'advisory', findings: ['f1'] });
  });

  it('POLICY_DECISION', () => {
    const e = buildPolicyDecisionEvent({
      sessionId: s,
      subjectType: 'command',
      subjectName: 'npm test',
      actionRequested: 'execute',
      decision: 'allow',
      reasonCode: 'policy_ok',
      reason: 'in allowlist',
      source: 'policy-engine',
    });
    expect(e.event_type).toBe('POLICY_DECISION');
    expect(e.session_id).toBe(s);
    expect(e.timestamp).toMatch(ISO_RE);
    expect(e.payload).toMatchObject({ subject_type: 'command', decision: 'allow' });
  });
});
