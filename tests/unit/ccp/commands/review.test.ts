import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { readArtifact, writeArtifact } from '../../../../src/ccp/artifacts/io';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { type ReviewStatus, runReview } from '../../../../src/ccp/commands/review';
import { taskStatePath } from '../../../../src/ccp/task-paths';
import type { UiAdapter } from '../../../../src/pi/ui';

function makeUi(status: ReviewStatus, scopeDrift = 'no drift', notes = ''): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => notes,
    select: async (_m, choices) => {
      if (choices.includes('PASS')) return status;
      return scopeDrift;
    },
  };
}

function makeFixture(): { dir: string; taskId: string; sessionId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-rev-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  const sessionId = 's1';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeTaskState(dir, taskId, 'AWAITING_HUMAN_REVIEW');

  const planEnv = makeEnvelope({ taskId, artifactType: 'PlanArtifact' });
  writeArtifact(dir, taskId, 'plan', {
    ...planEnv,
    artifact_type: 'PlanArtifact',
    source_grill_record: 'g',
    scope: { in: ['.'], out: [] },
    steps: [
      {
        id: 'S-1',
        title: 't',
        purpose: 'p',
        expected_files: [],
        commands: [],
        verification: [],
        risk_tier: 'low',
        depends_on: [],
      },
    ],
    approval_required: [],
    rollback: { strategy: 's' },
  });

  const verEnv = makeEnvelope({ taskId, artifactType: 'VerificationRecord' });
  writeArtifact(dir, taskId, 'verification', {
    ...verEnv,
    artifact_type: 'VerificationRecord',
    result: 'pass',
    commands: [],
    next_action: null,
  });

  return { dir, taskId, sessionId };
}

describe('runReview', () => {
  it('writes valid ReviewRecord artifact on PASS', async () => {
    const { dir, taskId, sessionId } = makeFixture();
    const result = await runReview({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    expect(result.status).toBe('PASS');
    const artifact = readArtifact(dir, taskId, 'review');
    expect((artifact as Record<string, unknown>).status).toBe('PASS');
    expect((artifact as Record<string, unknown>).artifact_type).toBe('ReviewRecord');
  });

  it('transitions to EVALUATING on PASS', async () => {
    const { dir, taskId, sessionId } = makeFixture();
    await runReview({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('EVALUATING');
  });

  it('transitions to EVALUATING on PASS_WITH_DEGRADATION', async () => {
    const { dir, taskId, sessionId } = makeFixture();
    await runReview({ repoRoot: dir, sessionId, taskId, ui: makeUi('PASS_WITH_DEGRADATION') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('EVALUATING');
  });

  it('transitions to VERIFYING on FAIL', async () => {
    const { dir, taskId, sessionId } = makeFixture();
    await runReview({ repoRoot: dir, sessionId, taskId, ui: makeUi('FAIL') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('VERIFYING');
  });

  it('transitions to VERIFYING on BLOCKED', async () => {
    const { dir, taskId, sessionId } = makeFixture();
    await runReview({ repoRoot: dir, sessionId, taskId, ui: makeUi('BLOCKED') });
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('VERIFYING');
  });

  it('propagates readArtifact error when plan artifact is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-rev-noplan-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const taskId = 'T-002';
    mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
    writeTaskState(dir, taskId, 'AWAITING_HUMAN_REVIEW');
    await expect(
      runReview({ repoRoot: dir, sessionId: 's2', taskId, ui: makeUi('PASS') }),
    ).rejects.toThrow();
  });
});
