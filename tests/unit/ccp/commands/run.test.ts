import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/unit/ccp/commands/run.test.ts
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { writeArtifact } from '../../../../src/ccp/artifacts/io';
import { runRun } from '../../../../src/ccp/commands/run';
import { makeMockStepExecutor } from '../../../../src/ccp/commands/shared/step-executor';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { readEvents } from '../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../src/core/runtime-paths';

function fixtureWithApprovedPlan(planSteps = 2): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-run-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: taskId }),
    'utf-8',
  );
  writeTaskState(dir, taskId, 'AWAITING_PLAN_APPROVAL');
  const env = makeEnvelope({ taskId, artifactType: 'PlanArtifact' });
  writeArtifact(dir, taskId, 'plan', {
    ...env,
    artifact_type: 'PlanArtifact',
    source_grill_record: 'g',
    scope: { in: ['.'], out: [] },
    steps: Array.from({ length: planSteps }, (_, i) => ({
      id: `S-${i + 1}`,
      title: `step ${i + 1}`,
      purpose: 'p',
      expected_files: [],
      commands: [],
      verification: [],
      risk_tier: 'low',
      depends_on: [],
    })),
    approval_required: [],
    rollback: { strategy: 's' },
  });
  return { dir, taskId };
}

describe('runRun', () => {
  it('executes all steps, writes ExecutionRecord, transitions to VERIFYING', async () => {
    const { dir, taskId } = fixtureWithApprovedPlan(2);
    const executor = makeMockStepExecutor({
      'S-1': { status: 'completed', commands_run: ['echo hi'] },
      'S-2': { status: 'completed' },
    });
    const result = await runRun({ repoRoot: dir, sessionId: 's1', taskId, executor });
    expect(result.outcome).toBe('verifying');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'execution'), 'utf-8'));
    expect(record.steps).toHaveLength(2);
    expect(record.steps[0].status).toBe('completed');
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('VERIFYING');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'COMMAND_STARTED')).toBeTruthy();
    expect(events.find((e) => e.event_type === 'COMMAND_COMPLETED')).toBeTruthy();
    // Phase 1: POLICY_DECISION emitted for gate allow
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde).toBeDefined();
    expect(pde!.payload.decision).toBe('allow');
    expect(pde!.payload.subject_name).toBe('/run');
  });

  it('wrong state emits POLICY_DECISION block and throws', async () => {
    const { dir, taskId } = fixtureWithApprovedPlan(1);
    writeTaskState(dir, taskId, 'GRILLING'); // wrong state
    const executor = makeMockStepExecutor({});
    await expect(runRun({ repoRoot: dir, sessionId: 's1', taskId, executor })).rejects.toThrow();
    const events = readEvents(sessionEventsPath(dir, 's1'));
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde).toBeDefined();
    expect(pde!.payload.decision).toBe('block');
    expect(pde!.payload.reason_code).toBe('wrong_state');
  });

  it('halts at first failed step, writes FAILED_RECOVERABLE', async () => {
    const { dir, taskId } = fixtureWithApprovedPlan(3);
    const executor = makeMockStepExecutor({
      'S-1': { status: 'completed' },
      'S-2': {
        status: 'failed',
        failure: { reason: 'cmd_exit_1', summary: 'tests failed', recoverable: true },
      },
    });
    const result = await runRun({ repoRoot: dir, sessionId: 's1', taskId, executor });
    expect(result.outcome).toBe('failed_recoverable');
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('FAILED_RECOVERABLE');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'execution'), 'utf-8'));
    expect(record.steps[1].status).toBe('failed');
    expect(record.steps).toHaveLength(2); // S-3 not attempted
  });

  it('--resume picks up after FAILED_RECOVERABLE skipping completed steps', async () => {
    const { dir, taskId } = fixtureWithApprovedPlan(3);
    const env = makeEnvelope({ taskId, artifactType: 'ExecutionRecord' });
    writeArtifact(dir, taskId, 'execution', {
      ...env,
      artifact_type: 'ExecutionRecord',
      plan_id: 'p',
      harness: 'pi',
      started_at: '2026-05-04T12:00:00Z',
      steps: [
        {
          step_id: 'S-1',
          status: 'completed',
          events: [],
          files_changed: [],
          commands_run: [],
          approvals: [],
          failure: null,
        },
        {
          step_id: 'S-2',
          status: 'failed',
          events: [],
          files_changed: [],
          commands_run: [],
          approvals: [],
          failure: { reason: 'r', summary: 's' },
        },
      ],
      final_state: 'FAILED_RECOVERABLE',
    });
    writeTaskState(dir, taskId, 'FAILED_RECOVERABLE');

    const executor = makeMockStepExecutor({
      'S-2': { status: 'completed' },
      'S-3': { status: 'completed' },
    });
    const result = await runRun({ repoRoot: dir, sessionId: 's1', taskId, executor, resume: true });
    expect(result.outcome).toBe('verifying');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'execution'), 'utf-8'));
    expect(record.steps).toHaveLength(3);
    expect(record.steps[1].status).toBe('completed');
    expect(record.steps[2].status).toBe('completed');
  });
});
