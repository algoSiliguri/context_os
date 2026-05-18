import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// tests/integration/section-16-demo.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrainClient, type BrainSpawnFn } from '../../src/ccp/brain/client';
import { runGrill } from '../../src/ccp/commands/grill';
import { runInit } from '../../src/ccp/commands/init';
import { runPlan } from '../../src/ccp/commands/plan';
import { runRemember } from '../../src/ccp/commands/remember';
import { runRun } from '../../src/ccp/commands/run';
import { makeMockStepExecutor } from '../../src/ccp/commands/shared/step-executor';
import { runStatus } from '../../src/ccp/commands/status';
import { runVerify } from '../../src/ccp/commands/verify';
import { taskArtifactPath, taskStatePath } from '../../src/ccp/task-paths';
import { readEvents } from '../../src/core/event-log';
import { sessionEventsPath } from '../../src/core/runtime-paths';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

async function setupRepo(): Promise<{ dir: string; sessionId: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'aos-s16-'));

  const exec = (cmd: string): string => {
    if (cmd.includes('brain --version')) return '0.0.0';
    throw new Error(`unexpected: ${cmd}`);
  };

  const result = await runInit({
    rest: 'section-16-demo --domain test --namespace section-16 --no-prompt',
    targetRoot: dir,
    ui: {
      confirm: async () => true,
      input: async () => '',
      select: async (_: string, c: string[]) => c[0] ?? '',
    },
    log: () => {},
    exec,
    sourceRoot: REPO_ROOT,
  });

  if (!result.ok) {
    throw new Error('runInit failed during test setup');
  }

  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 'sess-s16', current_task_id: null }),
    'utf-8',
  );

  return { dir, sessionId: 'sess-s16' };
}

function scriptedUi(answers: string[], confirmAnswers: boolean[] = []) {
  let inputIdx = 0;
  let confirmIdx = 0;
  return {
    confirm: async () => confirmAnswers[confirmIdx++] ?? true,
    input: async () => answers[inputIdx++] ?? 'done',
    select: async (_m: string, choices: string[]) => choices[0]!,
  };
}

describe('Section-16 demo — end-to-end', () => {
  beforeEach(() => { process.env.BRAIN_DB_PATH = '/test/knowledge.db'; });
  afterEach(() => { delete process.env.BRAIN_DB_PATH; });
  it('grill → plan → run (with one recoverable failure) → resume → verify → remember → status', async () => {
    const { dir, sessionId } = await setupRepo();

    // 1. /grill
    const grillUi = scriptedUi([
      'evidence X',
      'risk Y',
      'risk Z',
      'no schema change',
      'tests pass',
      'see context.md',
      'done',
    ]);
    const grillResult = await runGrill({
      repoRoot: dir,
      sessionId,
      goal: 'Add rate limit to /api/v1/auth',
      userType: 'developer',
      ui: grillUi,
    });
    expect(grillResult.taskId).toBe('T-001');

    // 2. /plan (approve)
    const planUi = scriptedUi([], [true]);
    const planResult = await runPlan({ repoRoot: dir, sessionId, taskId: 'T-001', ui: planUi });
    expect(planResult.outcome).toBe('approved');

    // 3. /run — first attempt: step 1 fails (recoverable)
    const failingExecutor = makeMockStepExecutor({
      'S-001': {
        status: 'failed',
        failure: { reason: 'compile_error', summary: 'TS2345 mismatch', recoverable: true },
      },
    });
    const runOne = await runRun({
      repoRoot: dir,
      sessionId,
      taskId: 'T-001',
      executor: failingExecutor,
    });
    expect(runOne.outcome).toBe('failed_recoverable');

    // 4. /run --resume — succeeds this time
    const resumingExecutor = makeMockStepExecutor({
      'S-001': {
        status: 'completed',
        commands_run: ['npm test'],
        files_changed: ['src/middleware/rate-limit.ts'],
      },
    });
    const runTwo = await runRun({
      repoRoot: dir,
      sessionId,
      taskId: 'T-001',
      executor: resumingExecutor,
      resume: true,
    });
    expect(runTwo.outcome).toBe('verifying');

    // 5. /verify (pass)
    const verifyResult = await runVerify({
      repoRoot: dir,
      sessionId,
      taskId: 'T-001',
      runner: { runCommand: async () => ({ exitCode: 0, stdout: 'all tests pass', stderr: '' }) },
    });
    expect(verifyResult.result).toBe('pass');

    // 6. /remember (approve all proposals)
    const writeCalls: number[] = [];
    const brainSpawn: BrainSpawnFn = async (_cmd, args) => {
      writeCalls.push(args.length);
      return {
        stdout: JSON.stringify({
          id: `kn-${writeCalls.length}`,
          content: 'x',
          tags: [],
          created_at: 't',
          confidence: 0.85,
        }),
        stderr: '',
        exitCode: 0,
      };
    };
    const brain = new BrainClient({ spawn: brainSpawn, repoRoot: dir });
    const rememberResult = await runRemember({
      repoRoot: dir,
      sessionId,
      taskId: 'T-001',
      brain,
      ui: scriptedUi([], [true, true, true, true, true]),
      projectName: 'section-16-demo',
    });
    expect(rememberResult.kept).toBeGreaterThan(0);

    // 7. /status — final
    const status = await runStatus({ repoRoot: dir, taskId: 'T-001' });
    expect(status?.current_state).toBe('COMPLETED');

    // Assert the event log tells the full story
    const events = readEvents(sessionEventsPath(dir, sessionId));
    const types = events.map((e) => e.event_type);
    expect(types).toContain('TASK_CREATED');
    expect(types).toContain('GRILL_STARTED');
    expect(types).toContain('SHARED_UNDERSTANDING_CREATED');
    expect(types).toContain('PLAN_CREATED');
    expect(types).toContain('PLAN_APPROVED');
    expect(types).toContain('COMMAND_FAILED'); // first run
    expect(types).toContain('COMMAND_COMPLETED'); // resume run
    expect(types).toContain('VERIFICATION_PASSED');
    expect(types).toContain('KNOWLEDGE_CAPTURE_APPROVED');
    expect(types).toContain('TASK_COMPLETED');

    // Assert all five persisted artifacts exist
    expect(existsSync(taskArtifactPath(dir, 'T-001', 'grill'))).toBe(true);
    expect(existsSync(taskArtifactPath(dir, 'T-001', 'plan'))).toBe(true);
    expect(existsSync(taskArtifactPath(dir, 'T-001', 'execution'))).toBe(true);
    expect(existsSync(taskArtifactPath(dir, 'T-001', 'verification'))).toBe(true);
    expect(existsSync(taskArtifactPath(dir, 'T-001', 'knowledge'))).toBe(true);

    // Final task state.json
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, 'T-001'), 'utf-8'));
    expect(stateRecord.state).toBe('COMPLETED');
  });
});
