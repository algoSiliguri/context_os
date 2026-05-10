import { randomUUID } from 'node:crypto';
import type { Event } from '../../core/events';

function brainBase(
  eventType: string,
  sessionId: string,
  extras: Record<string, unknown>,
): Event {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    session_id: sessionId,
    trace_id: sessionId,
    span_id: randomUUID(),
    parent_span_id: null,
    system_id: 'agent-os',
    constitution_version: 'v2',
    harness_id: 'pi',
    timestamp: new Date().toISOString(),
    payload: extras,
  };
}

export function buildBrainQueryEvent(args: {
  sessionId: string;
  queryHash: string;
  resultCount: number;
  latencyMs: number;
  tagCount: number;
}): Event {
  return brainBase('BRAIN_QUERY', args.sessionId, {
    query_hash: args.queryHash,
    result_count: args.resultCount,
    latency_ms: args.latencyMs,
    tag_count: args.tagCount,
  });
}

export function buildBrainWriteEvent(args: {
  sessionId: string;
  contentHash: string;
  tagCount: number;
  confidence: number;
  latencyMs: number;
}): Event {
  return brainBase('BRAIN_WRITE', args.sessionId, {
    content_hash: args.contentHash,
    tag_count: args.tagCount,
    confidence: args.confidence,
    latency_ms: args.latencyMs,
  });
}
