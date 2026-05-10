import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { writeArtifact } from '../../../../src/ccp/artifacts/io';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { type VerificationRunner, runVerify } from '../../../../src/ccp/commands/verify';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { readEvents } from '../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../src/core/runtime-paths';

function fixtureWithPlanSteps(verificationCommands: string[]): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-vfy-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeTaskState(dir, taskId, 'VERIFYING');
  const env = makeEnvelope({ taskId, artifactType: 'PlanArtifact' });
  writeArtifact(dir, taskId, 'plan', {
    ...env,
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
        verification: verificationCommands.map((c) => ({
          command: c,
          expected_signal: 'exit code 0',
        })),
        risk_tier: 'low',
        depends_on: [],
      },
    ],
    approval_required: [],
    rollback: { strategy: 's' },
  });
  return { dir, taskId };
}

describe('runVerify', () => {
  it('runs all verification commands, writes pass result, transitions to AWAITING_HUMAN_REVIEW', async () => {
    const { dir, taskId } = fixtureWithPlanSteps(['echo hi', 'echo ok']);
    const runner: VerificationRunner = {
      runCommand: async () => ({ exitCode: 0, stdout: 'OK', stderr: '' }),
    };
    const result = await runVerify({ repoRoot: dir, sessionId: 's1', taskId, runner });
    expect(result.result).toBe('pass');
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('AWAITING_HUMAN_REVIEW');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'verification'), 'utf-8'));
    expect(record.commands).toHaveLength(2);
    expect(record.result).toBe('pass');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'VERIFICATION_PASSED')).toBeTruthy();
  });

  it('writes fail result + FAILED_RECOVERABLE on first failing command', async () => {
    const { dir, taskId } = fixtureWithPlanSteps(['npm test']);
    let calls = 0;
    const runner: VerificationRunner = {
      runCommand: async () => {
        calls++;
        return { exitCode: 1, stdout: 'tests failed at step 5', stderr: '' };
      },
    };
    const result = await runVerify({ repoRoot: dir, sessionId: 's1', taskId, runner });
    expect(result.result).toBe('fail');
    expect(calls).toBe(1);
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('FAILED_RECOVERABLE');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'verification'), 'utf-8'));
    expect(record.next_action).toBeTruthy();
  });
});
