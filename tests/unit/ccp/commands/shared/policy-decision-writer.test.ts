import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitPolicyDecision } from '../../../../../src/ccp/commands/shared/policy-decision-writer';
import { readEvents } from '../../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../../src/core/runtime-paths';

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-pdw-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  return dir;
}

describe('policy-decision-writer', () => {
  it('emits POLICY_DECISION event to session log', () => {
    const dir = makeDir();
    const sessionId = 'test-session-1';
    emitPolicyDecision(dir, sessionId, {
      taskId: 'T-001',
      subjectType: 'phase_transition',
      subjectName: '/run',
      actionRequested: 'enter EXECUTING',
      decision: 'allow',
      reasonCode: 'state_ok',
      reason: 'state is AWAITING_PLAN_APPROVAL',
      source: 'command_handler',
    });
    const events = readEvents(sessionEventsPath(dir, sessionId));
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde).toBeDefined();
    expect(pde!.payload.decision).toBe('allow');
    expect(pde!.payload.subject_name).toBe('/run');
    expect(pde!.payload.reason_code).toBe('state_ok');
    expect(pde!.payload.task_id).toBe('T-001');
    expect(pde!.payload.source).toBe('command_handler');
  });

  it('emits block decision with correct fields', () => {
    const dir = makeDir();
    const sessionId = 'test-session-2';
    emitPolicyDecision(dir, sessionId, {
      subjectType: 'tool_call',
      subjectName: 'bash',
      actionRequested: 'execute',
      decision: 'block',
      reasonCode: 'tier_4_blocked',
      reason: 'bash is tier 4 and blocked',
      riskTier: 4,
      approvedBy: 'none',
      source: 'tool_call',
    });
    const events = readEvents(sessionEventsPath(dir, sessionId));
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde!.payload.decision).toBe('block');
    expect(pde!.payload.risk_tier).toBe(4);
    expect(pde!.payload.approved_by).toBe('none');
  });

  it('emits memory_write approved decision', () => {
    const dir = makeDir();
    const sessionId = 'test-session-3';
    emitPolicyDecision(dir, sessionId, {
      taskId: 'T-001',
      subjectType: 'memory_write',
      subjectName: 'MC-001',
      actionRequested: 'write to brain',
      decision: 'approved',
      reasonCode: 'human_approved',
      reason: 'user confirmed memory capture',
      approvedBy: 'human',
      memoryCandidateRefs: ['MC-001'],
      source: 'memory_staging',
    });
    const events = readEvents(sessionEventsPath(dir, sessionId));
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde!.payload.decision).toBe('approved');
    expect(pde!.payload.approved_by).toBe('human');
    expect(pde!.payload.memory_candidate_refs).toEqual(['MC-001']);
  });

  it('does not throw when cwd is not a project dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pdw-noop-'));
    // No .agent-os dir — emitPolicyDecision must not throw
    expect(() => {
      emitPolicyDecision(dir, 'no-session', {
        subjectType: 'phase_transition',
        subjectName: '/run',
        actionRequested: 'test',
        decision: 'allow',
        reasonCode: 'test',
        reason: 'test',
        source: 'test',
      });
    }).not.toThrow();
  });
});
