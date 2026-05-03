import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { appendJsonlEventAtomic } from './session-store';
import { buildToolRequestedEvent, buildPermissionDeniedEvent } from './events';
import { eventLogPath } from './runtime-paths';
import { loadProjectConfig } from './manifest';
import { buildMemoryRoute } from './memory-router';

export function computeActionHash(capability: string, resolvedArgs: Record<string, unknown>): string {
  const sorted = JSON.stringify({ capability, args: sortKeysDeep(resolvedArgs) });
  return createHash('sha256').update(sorted, 'utf-8').digest('hex').slice(0, 16);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export async function requestCriticalAction(args: {
  repoRoot: string;
  sessionId: string;
  capability: string;
  resolvedArgs: Record<string, unknown>;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = args.ttlSeconds ?? 30;
  const config = loadProjectConfig(join(args.repoRoot, '.agent-os', 'project.yaml'));
  buildMemoryRoute({
    manifest: config,
    repoRoot: args.repoRoot,
    globalRoot: join(args.repoRoot, '..', '.knowledge-brain'),
  });
  const logPath = eventLogPath(args.repoRoot);
  const requestedAt = new Date();
  const expiresAt = new Date(requestedAt.getTime() + ttl * 1000);
  const actionHash = computeActionHash(args.capability, args.resolvedArgs);
  const event = buildToolRequestedEvent({
    sessionId: args.sessionId,
    actionHash,
    capability: args.capability,
    paramsDigestSource: JSON.stringify(sortKeysDeep(args.resolvedArgs)),
    requestedAt: requestedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    timestamp: requestedAt.toISOString(),
  });
  appendJsonlEventAtomic(logPath, event);
  // TODO(Plan 2): mirror to brain via brain CLI projection. v1 stub.
  return actionHash;
}

export function guardMemoryWrite(args: {
  sessionId: string;
  actionHash: string;
  requestedNamespace: string;
  allowedNamespace: string;
  globalWritesEnabled: boolean;
  logPath: string;
}): boolean {
  if (args.requestedNamespace === args.allowedNamespace) return true;
  if (args.requestedNamespace === 'global' && !args.globalWritesEnabled) {
    appendJsonlEventAtomic(
      args.logPath,
      buildPermissionDeniedEvent({
        sessionId: args.sessionId,
        actionHash: args.actionHash,
        reason: 'global_memory_write_blocked',
      }),
    );
    return false;
  }
  return false;
}
