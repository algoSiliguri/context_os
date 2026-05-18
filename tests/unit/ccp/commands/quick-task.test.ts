import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readArtifact } from '../../../../src/ccp/artifacts/io';
import { runQuickTask } from '../../../../src/ccp/commands/quick-task';
import { taskStatePath } from '../../../../src/ccp/task-paths';
import type { UiAdapter } from '../../../../src/pi/ui';

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-qt-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  return dir;
}

// allocateNextTaskId returns T-001 for a fresh dir (counter missing → starts at 1)
const TASK_ID = 'T-001';

function normalUi(outcome: 'PASS_QUICK' | 'FAIL'): UiAdapter {
  return {
    confirm: async () => true,
    input: async (_m) => (_m.includes('files') ? 'src/foo.ts, src/bar.ts' : 'npm test'),
    select: async (_m, choices) => {
      if (choices.some((c) => c.startsWith('yes'))) return choices[0] ?? ''; // no — proceed
      return outcome;
    },
  };
}

function escalateUi(): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => '',
    select: async (_m, choices) => choices.find((c) => c.startsWith('yes')) ?? choices[0] ?? '',
  };
}

describe('runQuickTask', () => {
  it('PASS_QUICK: writes QuickTaskRecord, artifact round-trips, transitions to AWAITING_HUMAN_REVIEW', async () => {
    const dir = makeDir();
    const result = await runQuickTask({
      repoRoot: dir,
      sessionId: 's1',
      taskSummary: 'fix typo',
      ui: normalUi('PASS_QUICK'),
    });
    expect(result.status).toBe('PASS_QUICK');
    expect(result.taskId).toBe(TASK_ID);
    const artifact = readArtifact(dir, TASK_ID, 'quick-task') as Record<string, unknown>;
    expect(artifact.artifact_type).toBe('QuickTaskRecord');
    expect(artifact.status).toBe('PASS_QUICK');
    expect(artifact.files_changed).toEqual(['src/foo.ts', 'src/bar.ts']);
    const state = JSON.parse(readFileSync(taskStatePath(dir, TASK_ID), 'utf-8'));
    expect(state.state).toBe('AWAITING_HUMAN_REVIEW');
  });

  it('FAIL: writes QuickTaskRecord, transitions to FAILED_RECOVERABLE', async () => {
    const dir = makeDir();
    const result = await runQuickTask({
      repoRoot: dir,
      sessionId: 's1',
      taskSummary: 'fix typo',
      ui: normalUi('FAIL'),
    });
    expect(result.status).toBe('FAIL');
    const artifact = readArtifact(dir, TASK_ID, 'quick-task') as Record<string, unknown>;
    expect(artifact.status).toBe('FAIL');
    const state = JSON.parse(readFileSync(taskStatePath(dir, TASK_ID), 'utf-8'));
    expect(state.state).toBe('FAILED_RECOVERABLE');
  });

  it('escalation: writes artifact with ESCALATED_TO_FULL_WORKFLOW, task aborted', async () => {
    const dir = makeDir();
    const result = await runQuickTask({
      repoRoot: dir,
      sessionId: 's1',
      taskSummary: 'big refactor',
      ui: escalateUi(),
    });
    expect(result.status).toBe('ESCALATED_TO_FULL_WORKFLOW');
    const artifact = readArtifact(dir, TASK_ID, 'quick-task') as Record<string, unknown>;
    expect(artifact.artifact_type).toBe('QuickTaskRecord');
    expect(artifact.status).toBe('ESCALATED_TO_FULL_WORKFLOW');
    const state = JSON.parse(readFileSync(taskStatePath(dir, TASK_ID), 'utf-8'));
    expect(state.state).toBe('ABORTED');
  });
});
