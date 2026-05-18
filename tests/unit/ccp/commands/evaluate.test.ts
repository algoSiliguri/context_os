import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { readArtifact, writeArtifact } from '../../../../src/ccp/artifacts/io';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { type TaskOutcome, runEvaluate } from '../../../../src/ccp/commands/evaluate';
import { taskStatePath } from '../../../../src/ccp/task-paths';
import type { UiAdapter } from '../../../../src/pi/ui';

function makeUi(outcome: TaskOutcome, processQuality = 'high', notes = ''): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => notes,
    select: async (_m, choices) => {
      if (choices.includes('PASS')) return outcome;
      if (choices.includes('high')) return processQuality;
      return choices[0] ?? '';
    },
  };
}

function makeFixture(verResult: string = 'pass'): { dir: string; taskId: string; sessionId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-eval-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  const sessionId = 's1';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeTaskState(dir, taskId, 'EVALUATING');

  const grillEnv = makeEnvelope({ taskId, artifactType: 'GrillRecord' });
  writeArtifact(dir, taskId, 'grill', {
    ...grillEnv,
    artifact_type: 'GrillRecord',
    goal: 'test goal',
    user_type: 'developer',
    problem_statement: 'test problem',
    assumptions: [],
    questions: [],
    risks: [],
    constraints: [],
    success_criteria: [
      { id: 'SC-1', text: 'criterion one' },
      { id: 'SC-2', text: 'criterion two' },
      { id: 'SC-3', text: 'criterion three' },
      { id: 'SC-4', text: 'criterion four' },
    ],
    decision: { proceed: true, reason: 'ok' },
    open_blockers: [],
  });

  const verEnv = makeEnvelope({ taskId, artifactType: 'VerificationRecord' });
  writeArtifact(dir, taskId, 'verification', {
    ...verEnv,
    artifact_type: 'VerificationRecord',
    result: verResult,
    commands: [],
    next_action: null,
  });

  const revEnv = makeEnvelope({ taskId, artifactType: 'ReviewRecord' });
  writeArtifact(dir, taskId, 'review', {
    ...revEnv,
    artifact_type: 'ReviewRecord',
    status: 'PASS',
    scope_drift: false,
    scope_drift_severity: 'no drift',
    notes: null,
    plan_step_count: 1,
    verification_result: verResult,
  });

  return { dir, taskId, sessionId };
}

describe('runEvaluate', () => {
  it('writes valid EvaluationRecord artifact on PASS and round-trips through readArtifact', async () => {
    const { dir, taskId, sessionId } = makeFixture('pass');
    const result = await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    expect(result.taskOutcome).toBe('PASS');
    const artifact = readArtifact(dir, taskId, 'evaluation') as Record<string, unknown>;
    expect(artifact.artifact_type).toBe('EvaluationRecord');
    expect(artifact.task_outcome).toBe('PASS');
    expect(artifact.criteria_satisfaction_rate).toBe(1.0);
  });

  it('criteriaSatisfactionRate = 1.0 for verResult pass', async () => {
    const { dir, taskId, sessionId } = makeFixture('pass');
    const result = await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    expect(result.criteriaSatisfactionRate).toBe(1.0);
  });

  // VerificationRecord schema only allows 'pass'|'fail'|'blocked' — 'pass_with_degradation'
  // is not a valid result value, so the 0.75 branch in evaluate.ts is unreachable via
  // valid artifacts. Characterizing the reachable 'blocked' path (also maps to 0.0).
  it('criteriaSatisfactionRate = 0.0 for verResult blocked', async () => {
    const { dir, taskId, sessionId } = makeFixture('blocked');
    const result = await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    expect(result.criteriaSatisfactionRate).toBe(0.0);
  });

  it('criteriaSatisfactionRate = 0.0 for verResult fail', async () => {
    const { dir, taskId, sessionId } = makeFixture('fail');
    // PASS outcome used to avoid the EVALUATING→FAILED_RECOVERABLE state machine bug
    const result = await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    expect(result.criteriaSatisfactionRate).toBe(0.0);
  });

  it('transitions to PERSISTING_KNOWLEDGE on PASS', async () => {
    const { dir, taskId, sessionId } = makeFixture('pass');
    await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('PERSISTING_KNOWLEDGE');
  });

  it('transitions to PERSISTING_KNOWLEDGE on PASS_WITH_DEGRADATION', async () => {
    const { dir, taskId, sessionId } = makeFixture('pass');
    await runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS_WITH_DEGRADATION') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('PERSISTING_KNOWLEDGE');
  });

  // Bug: evaluate.ts attempts EVALUATING→FAILED_RECOVERABLE which the state machine
  // does not permit (EVALUATING only allows →PERSISTING_KNOWLEDGE or →COMPLETED).
  // Characterizing actual behavior: runEvaluate throws on FAIL outcome.
  it('throws on FAIL outcome due to invalid state transition EVALUATING→FAILED_RECOVERABLE', async () => {
    const { dir, taskId, sessionId } = makeFixture('fail');
    await expect(
      runEvaluate({ repoRoot: dir, sessionId, taskId, ui: makeUi('FAIL') }),
    ).rejects.toThrow('invalid task transition: EVALUATING -> FAILED_RECOVERABLE');
  });

  it('propagates readArtifact error when grill artifact is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-eval-nogrill-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const taskId = 'T-002';
    mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
    writeTaskState(dir, taskId, 'EVALUATING');
    await expect(
      runEvaluate({ repoRoot: dir, sessionId: 's2', taskId, ui: makeUi('PASS') }),
    ).rejects.toThrow();
  });
});
