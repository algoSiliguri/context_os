import { randomUUID } from 'node:crypto';

export type Event = {
  event_id: string;
  event_type: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  system_id: 'agent-os';
  constitution_version: string;
  harness_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

interface BaseOpts {
  sessionId: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
  parentSpanId?: string | null;
  harnessId?: string;
}

function baseEvent(eventType: string, opts: BaseOpts): Event {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    session_id: opts.sessionId,
    trace_id: opts.sessionId,
    span_id: randomUUID(),
    parent_span_id: opts.parentSpanId ?? null,
    system_id: 'agent-os',
    constitution_version: 'v2',
    harness_id: opts.harnessId ?? 'context-os-runtime',
    timestamp: opts.timestamp ?? new Date().toISOString(),
    payload: opts.payload ?? {},
  };
}

export function buildBindingEvent(args: {
  sessionId: string;
  projectId: string;
  state?: string | null;
  runtimeVersion?: string | null;
  conditionsVerified?: string[];
  failedCondition?: string | null;
  softFailed?: string[];
  detail?: string | null;
}): Event {
  return baseEvent('BINDING', {
    sessionId: args.sessionId,
    payload: {
      project_id: args.projectId,
      state: args.state ?? null,
      runtime_version: args.runtimeVersion ?? null,
      conditions_verified: args.conditionsVerified ?? [],
      failed_condition: args.failedCondition ?? null,
      soft_failed: args.softFailed ?? [],
      detail: args.detail ?? null,
    },
  });
}

export function buildStateTransitionEvent(args: {
  sessionId: string;
  toState: string;
}): Event {
  return baseEvent('STATE_TRANSITION', {
    sessionId: args.sessionId,
    payload: { to_state: args.toState },
  });
}

export function buildHeartbeatEvent(args: {
  sessionId: string;
  state: string;
  timestamp?: string;
}): Event {
  return baseEvent('HEARTBEAT', {
    sessionId: args.sessionId,
    timestamp: args.timestamp,
    payload: {
      state: args.state,
      queue_depth: 0,
      loaded_skills: [],
      hot_cache_size: 0,
      cold_cache_size: 0,
      last_error: null,
    },
  });
}

export function buildPermissionDeniedEvent(args: {
  sessionId: string;
  actionHash: string;
  reason: string;
}): Event {
  return baseEvent('PERMISSION_DENIED', {
    sessionId: args.sessionId,
    payload: { action_hash: args.actionHash, reason: args.reason },
  });
}

export function buildSkillLoadEvent(args: { sessionId: string; skillName: string }): Event {
  return baseEvent('SKILL_LOAD', {
    sessionId: args.sessionId,
    payload: { skill_name: args.skillName },
  });
}

export function buildSkillUnloadEvent(args: { sessionId: string; skillName: string }): Event {
  return baseEvent('SKILL_UNLOAD', {
    sessionId: args.sessionId,
    payload: { skill_name: args.skillName },
  });
}

export function buildViolationEvent(args: { sessionId: string; reason: string }): Event {
  return baseEvent('VIOLATION', {
    sessionId: args.sessionId,
    payload: { reason: args.reason },
  });
}

// --- Q2 renames ---

export function buildToolRequestedEvent(args: {
  sessionId: string;
  actionHash: string;
  capability: string;
  paramsDigestSource: string;
  requestedAt: string;
  expiresAt: string;
  timestamp?: string;
}): Event {
  return baseEvent('TOOL_REQUESTED', {
    sessionId: args.sessionId,
    timestamp: args.timestamp,
    payload: {
      action_hash: args.actionHash,
      capability: args.capability,
      params_digest_source: args.paramsDigestSource,
      requested_at: args.requestedAt,
      expires_at: args.expiresAt,
    },
  });
}

export function buildToolApprovedEvent(args: {
  sessionId: string;
  actionHash: string;
  approverMeta: Record<string, unknown>;
  timestamp?: string;
}): Event {
  return baseEvent('TOOL_APPROVED', {
    sessionId: args.sessionId,
    timestamp: args.timestamp,
    payload: { action_hash: args.actionHash, approver_meta: args.approverMeta },
  });
}

export function buildToolDeniedEvent(args: {
  sessionId: string;
  actionHash: string;
  reason: string;
  timestamp?: string;
}): Event {
  return baseEvent('TOOL_DENIED', {
    sessionId: args.sessionId,
    timestamp: args.timestamp,
    payload: { action_hash: args.actionHash, reason: args.reason },
  });
}
