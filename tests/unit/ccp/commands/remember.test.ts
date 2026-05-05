import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { BrainClient, type BrainSpawnFn } from '../../../../src/ccp/brain/client';
import { buildCommandCompletedEvent, buildPlanApprovedEvent } from '../../../../src/ccp/ccp-events';
import { runRemember } from '../../../../src/ccp/commands/remember';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { eventLogPath } from '../../../../src/core/runtime-paths';
import { appendJsonlEventAtomic } from '../../../../src/core/session-store';

function fixtureReady(): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-rmb-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: taskId }),
    'utf-8',
  );
  writeTaskState(dir, taskId, 'AWAITING_HUMAN_REVIEW');
  appendJsonlEventAtomic(
    eventLogPath(dir),
    buildPlanApprovedEvent({ sessionId: 's1', taskId, planId: 'p-1' }),
  );
  appendJsonlEventAtomic(
    eventLogPath(dir),
    buildCommandCompletedEvent({
      sessionId: 's1',
      taskId,
      stepId: 'S-1',
      command: 'npm test',
      exitCode: 0,
    }),
  );
  return { dir, taskId };
}

describe('runRemember', () => {
  it('proposes captures, prompts user, writes approved ones to brain, transitions to COMPLETED', async () => {
    const { dir, taskId } = fixtureReady();
    const writeCalls: Array<{ args: string[] }> = [];
    const spawn: BrainSpawnFn = async (_cmd, args) => {
      writeCalls.push({ args });
      return {
        stdout: JSON.stringify({
          id: 'kn-1',
          content: 'x',
          tags: [],
          created_at: 't',
          confidence: 0.85,
        }),
        stderr: '',
        exitCode: 0,
      };
    };
    const brain = new BrainClient({ dbPath: '/brain.db', spawn, repoRoot: dir });

    let prompts = 0;
    const ui = {
      confirm: async () => {
        prompts++;
        return prompts === 1;
      },
      input: async () => '',
      select: async (_m: string, choices: string[]) => choices[0]!,
    };

    const result = await runRemember({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      brain,
      ui,
      projectName: 'demo',
    });
    expect(result.kept).toBeGreaterThanOrEqual(1);
    expect(result.dropped).toBeGreaterThanOrEqual(0);

    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('COMPLETED');

    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'knowledge'), 'utf-8'));
    expect(record.items.length).toBeGreaterThan(0);
    expect(writeCalls.length).toBe(result.kept);
    expect(
      record.items.find((i: { approval: string }) => i.approval === 'approved')?.brain_status,
    ).toBe('written');
  });

  it('records brain_status=deferred when brain is unavailable', async () => {
    const { dir, taskId } = fixtureReady();
    // spawn always throws (simulates brain CLI not on PATH)
    const spawn: BrainSpawnFn = async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    const brain = new BrainClient({ dbPath: '/brain.db', spawn, repoRoot: dir });
    // approve the first proposal
    let prompts = 0;
    const ui = {
      confirm: async () => {
        prompts++;
        return prompts === 1;
      },
      input: async () => '',
      select: async (_m: string, choices: string[]) => choices[0]!,
    };
    const result = await runRemember({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      brain,
      ui,
      projectName: 'demo',
    });
    expect(result.kept).toBeGreaterThanOrEqual(1);
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'knowledge'), 'utf-8'));
    const approvedItem = record.items.find((i: { approval: string }) => i.approval === 'approved');
    expect(approvedItem?.brain_status).toBe('deferred');
  });

  it('skips brain writes when there are no proposals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-rmb-empty-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const taskId = 'T-001';
    mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: taskId }),
      'utf-8',
    );
    writeTaskState(dir, taskId, 'AWAITING_HUMAN_REVIEW');

    const writeCalls: Array<{ args: string[] }> = [];
    const spawn: BrainSpawnFn = async (_cmd, args) => {
      writeCalls.push({ args });
      return { stdout: '{}', stderr: '', exitCode: 0 };
    };
    const brain = new BrainClient({ dbPath: '/brain.db', spawn, repoRoot: dir });
    const ui = {
      confirm: async () => true,
      input: async () => '',
      select: async (_m: string, choices: string[]) => choices[0]!,
    };
    const result = await runRemember({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      brain,
      ui,
      projectName: 'demo',
    });
    expect(result.kept).toBe(0);
    expect(writeCalls).toHaveLength(0);
  });
});
