import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { runGrill } from '../../../../src/ccp/commands/grill';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { readEvents } from '../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../src/core/runtime-paths';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-grl-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  mkdirSync(join(dir, '.agent-os', 'tasks'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1' }),
    'utf-8',
  );
  return dir;
}

function scriptedUi(answers: string[]) {
  let i = 0;
  return {
    confirm: async () => true,
    input: async () => answers[i++] ?? 'done',
    select: async (_msg: string, choices: string[]) => choices[0]!,
  };
}

describe('runGrill', () => {
  it('runs the question loop, writes GrillRecord, transitions task to SHARED_UNDERSTANDING', async () => {
    const dir = fixture();
    const ui = scriptedUi([
      'existing JWT',
      'evidence X',
      'leak risk',
      'planned mitigation',
      'no schema change',
      'tests pass',
      'see CONTEXT.md',
      'done',
    ]);
    const result = await runGrill({
      repoRoot: dir,
      sessionId: 's1',
      goal: 'Add rate limit to /api/v1/auth',
      userType: 'developer',
      ui,
    });
    expect(result.taskId).toMatch(/^T-\d{3}$/);
    expect(existsSync(taskArtifactPath(dir, result.taskId, 'grill'))).toBe(true);
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, result.taskId, 'grill'), 'utf-8'));
    expect(yaml.goal).toBe('Add rate limit to /api/v1/auth');
    expect(yaml.questions.length).toBeGreaterThan(0);
    expect(yaml.decision.proceed).toBe(true);
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, result.taskId), 'utf-8'));
    expect(stateRecord.state).toBe('SHARED_UNDERSTANDING');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'TASK_CREATED')).toBeTruthy();
    expect(events.find((e) => e.event_type === 'GRILL_STARTED')).toBeTruthy();
    expect(events.find((e) => e.event_type === 'SHARED_UNDERSTANDING_CREATED')).toBeTruthy();
    expect(events.filter((e) => e.event_type === 'QUESTION_ASKED').length).toBeGreaterThan(0);
    expect(events.filter((e) => e.event_type === 'ANSWER_RECORDED').length).toBeGreaterThan(0);
  });

  it('marks decision.proceed=false if user types "stop"', async () => {
    const dir = fixture();
    const ui = scriptedUi(['stop']);
    const result = await runGrill({
      repoRoot: dir,
      sessionId: 's1',
      goal: 'g',
      userType: 'developer',
      ui,
    });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, result.taskId, 'grill'), 'utf-8'));
    expect(yaml.decision.proceed).toBe(false);
  });
});
