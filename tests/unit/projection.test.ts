import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildTaskCreatedEvent, buildTaskStateTransitionEvent } from '../../src/ccp/ccp-events';
import { buildToolApprovedEvent, buildToolRequestedEvent } from '../../src/core/events';
import {
  initProjectionSchema,
  mirrorApprovalEvent,
  mirrorTaskEvent,
} from '../../src/core/projection';

describe('projection', () => {
  function setup(): { dbPath: string; db: Database.Database } {
    const dir = mkdtempSync(join(tmpdir(), 'aos-proj-'));
    const dbPath = join(dir, 'projection.db');
    const db = new Database(dbPath);
    initProjectionSchema(db);
    return { dbPath, db };
  }

  it('initProjectionSchema creates the approvals table', () => {
    const { db } = setup();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='approvals'")
      .get();
    expect(row).toBeTruthy();
  });

  it('mirrorApprovalEvent inserts PENDING row for TOOL_REQUESTED', () => {
    const { db } = setup();
    const e = buildToolRequestedEvent({
      sessionId: 's1',
      actionHash: 'h-1',
      capability: 'memory_write_global',
      paramsDigestSource: '{}',
      requestedAt: '2026-05-03T14:00:00Z',
      expiresAt: '2026-05-03T14:00:30Z',
    });
    mirrorApprovalEvent(db, e, { namespace: 'demo' });
    const row = db.prepare('SELECT * FROM approvals WHERE action_hash = ?').get('h-1') as
      | {
          final_status: string;
        }
      | undefined;
    expect(row?.final_status).toBe('PENDING');
  });

  it('TOOL_APPROVED transitions the row to APPROVED', () => {
    const { db } = setup();
    mirrorApprovalEvent(
      db,
      buildToolRequestedEvent({
        sessionId: 's1',
        actionHash: 'h-1',
        capability: 'cap',
        paramsDigestSource: '{}',
        requestedAt: '2026-05-03T14:00:00Z',
        expiresAt: '2026-05-03T14:00:30Z',
      }),
      { namespace: 'demo' },
    );
    mirrorApprovalEvent(
      db,
      buildToolApprovedEvent({
        sessionId: 's1',
        actionHash: 'h-1',
        approverMeta: { user: 'agniva' },
      }),
      { namespace: 'demo' },
    );
    const row = db.prepare('SELECT * FROM approvals WHERE action_hash = ?').get('h-1') as {
      final_status: string;
    };
    expect(row.final_status).toBe('APPROVED');
  });
});

describe('projection — task tables', () => {
  function setup(): { db: Database.Database } {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pj-'));
    const dbPath = join(dir, 'projection.db');
    const db = new Database(dbPath);
    initProjectionSchema(db);
    return { db };
  }

  it('initProjectionSchema creates the tasks table', () => {
    const { db } = setup();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
      .get();
    expect(row).toBeTruthy();
  });

  it('mirrorTaskEvent inserts on TASK_CREATED', () => {
    const { db } = setup();
    const e = buildTaskCreatedEvent({
      sessionId: 's1',
      taskId: 'T-001',
      goal: 'g',
      userType: 'developer',
    });
    mirrorTaskEvent(db, e);
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('T-001') as {
      current_state: string;
    };
    expect(row.current_state).toBe('NEW_IDEA');
  });

  it('TASK_STATE_TRANSITION updates current_state', () => {
    const { db } = setup();
    mirrorTaskEvent(
      db,
      buildTaskCreatedEvent({ sessionId: 's1', taskId: 'T-001', goal: 'g', userType: 'developer' }),
    );
    mirrorTaskEvent(
      db,
      buildTaskStateTransitionEvent({
        sessionId: 's1',
        taskId: 'T-001',
        from: 'NEW_IDEA',
        to: 'GRILLING',
        triggeredBy: '/grill',
      }),
    );
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('T-001') as {
      current_state: string;
    };
    expect(row.current_state).toBe('GRILLING');
  });
});
