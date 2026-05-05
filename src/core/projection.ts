import type Database from 'better-sqlite3';
import type { Event } from './events';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS approvals (
  session_id     TEXT NOT NULL,
  action_hash    TEXT NOT NULL,
  namespace      TEXT NOT NULL,
  capability     TEXT NOT NULL,
  requested_at   TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  approved_at    TEXT,
  denied_at      TEXT,
  invalidated_at TEXT,
  final_status   TEXT NOT NULL,
  reason         TEXT,
  PRIMARY KEY (session_id, action_hash)
);
`;

const TASK_SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  task_id        TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  goal           TEXT,
  current_state  TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
`;

export function initProjectionSchema(db: Database.Database): void {
  db.exec(SCHEMA);
  db.exec(TASK_SCHEMA);
}

function eventValue(event: Event, key: string): string | undefined {
  const fromPayload = event.payload?.[key];
  if (fromPayload !== undefined && fromPayload !== null) return String(fromPayload);
  return undefined;
}

export function mirrorApprovalEvent(
  db: Database.Database,
  event: Event,
  opts: { namespace: string },
): void {
  const sessionId = event.session_id;
  const actionHash = String(eventValue(event, 'action_hash') ?? '');
  if (!actionHash) return;

  const finalStatusByType: Record<string, string> = {
    TOOL_REQUESTED: 'PENDING',
    TOOL_APPROVED: 'APPROVED',
    TOOL_DENIED: 'DENIED',
  };
  let finalStatus = finalStatusByType[event.event_type];
  if (!finalStatus) return;
  const reason = eventValue(event, 'reason') ?? '';
  if (event.event_type === 'TOOL_DENIED' && reason === 'auto_rejected_ttl_expired') {
    finalStatus = 'EXPIRED';
  }

  const ts = event.timestamp;
  const requestedAt = eventValue(event, 'requested_at') ?? ts;
  const expiresAt = eventValue(event, 'expires_at') ?? ts;
  const approvedAt = finalStatus === 'APPROVED' ? ts : null;
  const deniedAt = finalStatus === 'DENIED' ? ts : null;
  const invalidatedAt = finalStatus === 'EXPIRED' ? ts : null;
  const capability = eventValue(event, 'capability') ?? '';

  db.prepare(`
    INSERT INTO approvals (session_id, action_hash, namespace, capability, requested_at, expires_at,
                           approved_at, denied_at, invalidated_at, final_status, reason)
    VALUES (@session_id, @action_hash, @namespace, @capability, @requested_at, @expires_at,
            @approved_at, @denied_at, @invalidated_at, @final_status, @reason)
    ON CONFLICT (session_id, action_hash) DO UPDATE SET
      approved_at    = COALESCE(excluded.approved_at, approvals.approved_at),
      denied_at      = COALESCE(excluded.denied_at, approvals.denied_at),
      invalidated_at = COALESCE(excluded.invalidated_at, approvals.invalidated_at),
      final_status   = excluded.final_status,
      reason         = excluded.reason
  `).run({
    session_id: sessionId,
    action_hash: actionHash,
    namespace: opts.namespace,
    capability,
    requested_at: requestedAt,
    expires_at: expiresAt,
    approved_at: approvedAt,
    denied_at: deniedAt,
    invalidated_at: invalidatedAt,
    final_status: finalStatus,
    reason,
  });
}

export function mirrorTaskEvent(db: Database.Database, event: Event): void {
  const taskId = String((event.payload as Record<string, unknown>).task_id ?? '');
  if (!taskId) return;
  const ts = event.timestamp;

  if (event.event_type === 'TASK_CREATED') {
    const goal = String((event.payload as Record<string, unknown>).goal ?? '');
    db.prepare(`
      INSERT INTO tasks (task_id, session_id, goal, current_state, created_at, updated_at)
      VALUES (@task_id, @session_id, @goal, 'NEW_IDEA', @ts, @ts)
      ON CONFLICT(task_id) DO NOTHING
    `).run({ task_id: taskId, session_id: event.session_id, goal, ts });
    return;
  }

  if (event.event_type === 'TASK_STATE_TRANSITION') {
    const to = String((event.payload as Record<string, unknown>).to ?? '');
    if (!to) return;
    db.prepare('UPDATE tasks SET current_state = ?, updated_at = ? WHERE task_id = ?').run(
      to,
      ts,
      taskId,
    );
    return;
  }

  if (event.event_type === 'TASK_COMPLETED') {
    db.prepare(
      "UPDATE tasks SET current_state = 'COMPLETED', updated_at = ? WHERE task_id = ?",
    ).run(ts, taskId);
    return;
  }

  if (event.event_type === 'TASK_ABORTED') {
    db.prepare("UPDATE tasks SET current_state = 'ABORTED', updated_at = ? WHERE task_id = ?").run(
      ts,
      taskId,
    );
  }
}
