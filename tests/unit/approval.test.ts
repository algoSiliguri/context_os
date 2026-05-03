import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJsonlEventAtomic } from '../../src/core/session-store';
import {
  buildToolRequestedEvent,
  buildToolApprovedEvent,
  buildToolDeniedEvent,
} from '../../src/core/events';
import { deriveActionStatus } from '../../src/core/approval';

describe('approval', () => {
  function makeLog(): string {
    const dir = mkdtempSync(join(tmpdir(), 'aos-app-'));
    return join(dir, 'events.jsonl');
  }

  it('returns NOT_ACTIONABLE if no events', () => {
    const result = deriveActionStatus(makeLog(), { sessionId: 's1', actionHash: 'h-1' });
    expect(result.final_status).toBe('NOT_ACTIONABLE');
    expect(result.executable).toBe(false);
  });

  it('returns PENDING after TOOL_REQUESTED', () => {
    const log = makeLog();
    appendJsonlEventAtomic(log, buildToolRequestedEvent({
      sessionId: 's1',
      actionHash: 'h-1',
      capability: 'memory_write_global',
      paramsDigestSource: '{}',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    }));
    expect(deriveActionStatus(log, { sessionId: 's1', actionHash: 'h-1' }).final_status).toBe('PENDING');
  });

  it('transitions PENDING -> APPROVED on TOOL_APPROVED', () => {
    const log = makeLog();
    appendJsonlEventAtomic(log, buildToolRequestedEvent({
      sessionId: 's1', actionHash: 'h-1', capability: 'cap', paramsDigestSource: '{}',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    }));
    appendJsonlEventAtomic(log, buildToolApprovedEvent({
      sessionId: 's1', actionHash: 'h-1', approverMeta: { user: 'agniva' },
    }));
    const r = deriveActionStatus(log, { sessionId: 's1', actionHash: 'h-1' });
    expect(r.final_status).toBe('APPROVED');
    expect(r.executable).toBe(true);
  });

  it('detects TTL expiry on TOOL_REQUESTED with past expires_at', () => {
    const log = makeLog();
    appendJsonlEventAtomic(log, buildToolRequestedEvent({
      sessionId: 's1', actionHash: 'h-1', capability: 'cap', paramsDigestSource: '{}',
      requestedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() - 30000).toISOString(),
    }));
    const r = deriveActionStatus(log, { sessionId: 's1', actionHash: 'h-1' });
    expect(r.final_status).toBe('EXPIRED');
    expect(r.blacklisted).toBe(true);
  });

  it('TOOL_DENIED with auto_rejected_ttl_expired reason maps to EXPIRED', () => {
    const log = makeLog();
    appendJsonlEventAtomic(log, buildToolRequestedEvent({
      sessionId: 's1', actionHash: 'h-1', capability: 'cap', paramsDigestSource: '{}',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    }));
    appendJsonlEventAtomic(log, buildToolDeniedEvent({
      sessionId: 's1', actionHash: 'h-1', reason: 'auto_rejected_ttl_expired',
    }));
    const r = deriveActionStatus(log, { sessionId: 's1', actionHash: 'h-1' });
    expect(r.final_status).toBe('EXPIRED');
  });

  it('TOOL_DENIED with other reason maps to DENIED', () => {
    const log = makeLog();
    appendJsonlEventAtomic(log, buildToolRequestedEvent({
      sessionId: 's1', actionHash: 'h-1', capability: 'cap', paramsDigestSource: '{}',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    }));
    appendJsonlEventAtomic(log, buildToolDeniedEvent({
      sessionId: 's1', actionHash: 'h-1', reason: 'user_denied',
    }));
    const r = deriveActionStatus(log, { sessionId: 's1', actionHash: 'h-1' });
    expect(r.final_status).toBe('DENIED');
  });
});
