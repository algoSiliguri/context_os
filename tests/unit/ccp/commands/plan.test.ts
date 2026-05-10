import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { writeArtifact } from '../../../../src/ccp/artifacts/io';
import { runPlan } from '../../../../src/ccp/commands/plan';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { readEvents } from '../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../src/core/runtime-paths';

function fixtureWithGrill(decision = true): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-pln-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: taskId }),
    'utf-8',
  );
  writeTaskState(dir, taskId, 'SHARED_UNDERSTANDING');
  const env = makeEnvelope({ taskId, artifactType: 'GrillRecord' });
  writeArtifact(dir, taskId, 'grill', {
    ...env,
    artifact_type: 'GrillRecord',
    goal: 'Add rate limit',
    user_type: 'developer',
    problem_statement: 'p',
    assumptions: [],
    questions: [],
    risks: [],
    constraints: [],
    success_criteria: [],
    decision: { proceed: decision, reason: 'r' },
    open_blockers: [],
  });
  return { dir, taskId };
}

const approveUi = {
  confirm: async () => true,
  input: async () => '',
  select: async (_m: string, choices: string[]) => choices[0]!,
};

describe('runPlan', () => {
  it('drafts, prompts, and writes PlanArtifact when approved', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const result = await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    expect(result.outcome).toBe('approved');
    expect(existsSync(taskArtifactPath(dir, taskId, 'plan'))).toBe(true);
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps.length).toBeGreaterThanOrEqual(1);
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('AWAITING_PLAN_APPROVAL');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'PLAN_CREATED')).toBeTruthy();
    expect(events.find((e) => e.event_type === 'PLAN_APPROVED')).toBeTruthy();
  });

  it('emits PLAN_REJECTED and reverts to SHARED_UNDERSTANDING when user rejects', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const rejectUi = {
      confirm: async () => false,
      input: async () => 'too risky',
      select: async (_m: string, choices: string[]) => choices[0]!,
    };
    const result = await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: rejectUi });
    expect(result.outcome).toBe('rejected');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'PLAN_REJECTED')).toBeTruthy();
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('SHARED_UNDERSTANDING');
  });

  it('throws when task is not in SHARED_UNDERSTANDING', async () => {
    const { dir, taskId } = fixtureWithGrill();
    writeTaskState(dir, taskId, 'EXECUTING');
    await expect(
      runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi }),
    ).rejects.toThrow(/SHARED_UNDERSTANDING/);
  });
});
