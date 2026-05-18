/**
 * Real lifecycle integration fixture.
 *
 * Uses a temp git repo with a tiny TypeScript source file. Commands run via
 * makeShellStepExecutor (real shell). LLM / Pi are NOT needed — plan, grill,
 * and UI responses are all deterministic fixtures.
 *
 * What this proves:
 *   - runRun executes real shell commands and captures output
 *   - scope enforcement passes on happy path, fails on extra files
 *   - runVerify runs a real verification command and records pass/fail
 *   - runReview and runEvaluate produce durable artifacts
 *   - memory candidates survive simulated restart
 *   - POLICY_DECISION events are emitted at each gate
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { makeEnvelope } from '../../src/ccp/artifacts/envelope';
import { writeArtifact } from '../../src/ccp/artifacts/io';
import { runEvaluate } from '../../src/ccp/commands/evaluate';
import { runRemember } from '../../src/ccp/commands/remember';
import { runReview } from '../../src/ccp/commands/review';
import { runRun } from '../../src/ccp/commands/run';
import {
  listPendingCandidates,
  stageCandidates,
} from '../../src/ccp/commands/shared/memory-staging';
import { makeShellStepExecutor } from '../../src/ccp/commands/shared/step-executor';
import { writeTaskState } from '../../src/ccp/commands/shared/task-loader';
import { taskArtifactPath, taskStatePath } from '../../src/ccp/task-paths';
import { BrainClient } from '../../src/ccp/brain/client';
import { readEvents } from '../../src/core/event-log';
import { sessionEventsPath } from '../../src/core/runtime-paths';
import type { UiAdapter } from '../../src/pi/ui';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-lifecycle-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

  // Minimal TypeScript project (no test framework — just node assert)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test-proj', version: '1.0.0', type: 'module' }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'add.ts'), 'export function add(a: number, b: number): number { return a + b; }\n');
  // Verification script: node assert (no deps needed)
  writeFileSync(
    join(dir, 'verify.mjs'),
    `import { add } from './src/add.js';\nconsole.assert(add(2,3)===5,'add 2+3 should be 5');\nconsole.log('ok');\n`,
  );

  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function makeFixture(dir: string): { taskId: string; sessionId: string } {
  const taskId = 'T-001';
  const sessionId = 's1';
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: sessionId, current_task_id: taskId }),
  );
  return { taskId, sessionId };
}

function writePlan(
  dir: string,
  taskId: string,
  opts: {
    commands: string[];
    expectedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' | 'read' }>;
    verifyCommand?: string;
  },
) {
  const env = makeEnvelope({ taskId, artifactType: 'PlanArtifact' });
  writeArtifact(dir, taskId, 'plan', {
    ...env,
    artifact_type: 'PlanArtifact',
    source_grill_record: 'g-fixture',
    scope: { in: ['.'], out: [] },
    steps: [
      {
        id: 'S-1',
        title: 'implement feature',
        purpose: 'fixture step',
        expected_files: opts.expectedFiles,
        commands: opts.commands.map((c) => ({ command: c, approval_tier: 1 })),
        verification: opts.verifyCommand
          ? [{ command: opts.verifyCommand, expected_signal: 'exit 0' }]
          : [],
        risk_tier: 'low',
        depends_on: [],
      },
    ],
    approval_required: [],
    rollback: { strategy: 'git checkout .' },
  });
}

function writeGrillRecord(dir: string, taskId: string) {
  const env = makeEnvelope({ taskId, artifactType: 'GrillRecord' });
  writeArtifact(dir, taskId, 'grill', {
    ...env,
    artifact_type: 'GrillRecord',
    goal: 'add multiply function',
    user_type: 'developer',
    problem_statement: 'Need a multiply function',
    questions: [],
    assumptions: [],
    risks: [],
    constraints: [],
    success_criteria: [{ id: 'SC-1', text: 'multiply(3,4) returns 12' }],
    decision: { proceed: true, reason: 'straightforward' },
    open_blockers: [],
  });
}

function noopUi(overrides: Partial<UiAdapter> = {}): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => '',
    select: async (_msg, choices) => choices[0] as string,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('lifecycle: happy path', () => {
  it('run executes real command, captures stdout, transitions to VERIFYING', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, {
      commands: [
        `printf 'export function multiply(a: number, b: number): number { return a * b; }\\n' > ${join(dir, 'src', 'multiply.ts')}`,
      ],
      expectedFiles: [{ path: 'src/multiply.ts', operation: 'create' }],
    });
    writeTaskState(dir, taskId, 'AWAITING_PLAN_APPROVAL');

    const executor = makeShellStepExecutor({ cwd: dir });
    const { outcome } = await runRun({ repoRoot: dir, sessionId, taskId, executor });

    expect(outcome).toBe('verifying');
    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('VERIFYING');

    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'execution'), 'utf-8'));
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0].status).toBe('completed');
    expect(record.steps[0].command_outputs[0].exit_code).toBe(0);

    // scope: only declared file changed
    expect(record.steps[0].scope_result).toMatch(/exact_match|subset_match/);

    // File exists on disk
    expect(existsSync(join(dir, 'src', 'multiply.ts'))).toBe(true);

    // POLICY_DECISION emitted for gate allow
    const events = readEvents(sessionEventsPath(dir, sessionId));
    const pde = events.find((e) => e.event_type === 'POLICY_DECISION');
    expect(pde?.payload.decision).toBe('allow');
    expect(pde?.payload.subject_name).toBe('/run');
  });

  it('verify runs real shell command, produces VerificationRecord pass', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, {
      commands: [],
      expectedFiles: [],
      verifyCommand: 'echo verified && exit 0',
    });
    writeTaskState(dir, taskId, 'VERIFYING');

    const { result } = await runRun_skipToVerify(dir, taskId, sessionId);
    expect(result).toBe('pass');

    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'verification'), 'utf-8'));
    expect(record.result).toBe('pass');
    expect(record.commands).toHaveLength(1);
    expect(record.commands[0].exit_code).toBe(0);
  });

  it('review produces ReviewRecord artifact', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, { commands: [], expectedFiles: [] });
    // Pre-write verification record so review can read it
    writeVerificationRecord(dir, taskId, 'pass');
    writeTaskState(dir, taskId, 'AWAITING_HUMAN_REVIEW');

    const { status } = await runReview({
      repoRoot: dir, sessionId, taskId,
      ui: noopUi({ select: async (_m, ch) => ch[0] as string }),
    });

    expect(status).toBe('PASS');
    expect(existsSync(taskArtifactPath(dir, taskId, 'review'))).toBe(true);
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'review'), 'utf-8'));
    expect(record.status).toBe('PASS');
  });

  it('evaluate produces EvaluationRecord artifact', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, { commands: [], expectedFiles: [] });
    writeGrillRecord(dir, taskId);
    writeVerificationRecord(dir, taskId, 'pass');
    writeReviewRecord(dir, taskId, 'PASS');
    writeTaskState(dir, taskId, 'EVALUATING');

    const { taskOutcome } = await runEvaluate({
      repoRoot: dir, sessionId, taskId,
      ui: noopUi({ select: async (_m, ch) => ch[0] as string }),
    });

    expect(taskOutcome).toBe('PASS');
    expect(existsSync(taskArtifactPath(dir, taskId, 'evaluation'))).toBe(true);
  });
});

describe('lifecycle: scope violation path', () => {
  it('command changes extra undeclared file → run fails with scope_violation', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);

    // Pre-commit a file so it's tracked, then command modifies it unexpectedly
    writeFileSync(join(dir, 'src', 'extra.ts'), 'export {};\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'add extra'], { cwd: dir });

    writePlan(dir, taskId, {
      commands: [
        // This modifies extra.ts which is NOT in expected_files
        `echo "export function multiply() {}" > ${join(dir, 'src', 'multiply.ts')} && echo "touched" >> ${join(dir, 'src', 'extra.ts')}`,
      ],
      expectedFiles: [{ path: 'src/multiply.ts', operation: 'create' }],
    });
    writeTaskState(dir, taskId, 'AWAITING_PLAN_APPROVAL');

    const executor = makeShellStepExecutor({ cwd: dir });
    const { outcome } = await runRun({ repoRoot: dir, sessionId, taskId, executor });

    expect(outcome).toBe('failed_recoverable');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'execution'), 'utf-8'));
    expect(record.steps[0].status).toBe('failed');
    expect(record.steps[0].scope_result).toBe('extra_files_detected');
    expect(record.steps[0].failure.reason).toBe('scope_violation');
    expect(record.steps[0].incidental_files).toContain('src/extra.ts');
  });
});

describe('lifecycle: verify failure path', () => {
  it('failing verification command → VerificationRecord fail → FAILED_RECOVERABLE', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, {
      commands: [],
      expectedFiles: [],
      verifyCommand: 'node -e "process.exit(1)"', // always fails
    });
    writeTaskState(dir, taskId, 'VERIFYING');

    const { result } = await runRun_skipToVerify(dir, taskId, sessionId);
    expect(result).toBe('fail');

    const state = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(state.state).toBe('FAILED_RECOVERABLE');
    const record = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'verification'), 'utf-8'));
    expect(record.result).toBe('fail');
    expect(record.commands[0].exit_code).not.toBe(0);
  });
});

describe('lifecycle: memory recovery path', () => {
  it('pending candidates survive simulated restart, /memory can recover them', () => {
    const dir = makeGitRepo();
    const { taskId } = makeFixture(dir);

    // Stage candidates (simulating /remember interrupted before brain write)
    stageCandidates(dir, taskId, 's1', [
      { content: 'always use TypeBox for schema validation', type: 'convention', scope: 'project', evidence: 'e' },
      { content: 'prefer immutable data in core modules', type: 'architecture', scope: 'project', evidence: 'e' },
    ]);

    // Simulate session restart: re-read from disk
    const pending = listPendingCandidates(dir, taskId);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.status).toBe('pending');
    expect(pending[0]!.content).toContain('TypeBox');
  });

  it('BrainClient.write succeeds with real brain CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-brain-'));
    mkdirSync(join(dir, 'data_store'), { recursive: true });
    const dbPath = join(dir, 'data_store', 'knowledge.db');
    execFileSync('brain', ['--db-path', dbPath, 'init']);

    const prevDbPath = process.env.BRAIN_DB_PATH;
    process.env.BRAIN_DB_PATH = dbPath;
    const client = new BrainClient({ repoRoot: dir });
    const result = await client.write({
      content: 'test convention from lifecycle',
      type: 'convention',
      scope: 'project',
      taskId: 'T-001',
      project: 'test',
    });

    expect(result.deferred).toBe(false);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
    if (prevDbPath !== undefined) process.env.BRAIN_DB_PATH = prevDbPath;
    else delete process.env.BRAIN_DB_PATH;
  });

  it('BrainClient.probe succeeds with real brain CLI', async () => {
    const prev = process.env.BRAIN_DB_PATH;
    process.env.BRAIN_DB_PATH = '/test/knowledge.db';
    const client = new BrainClient({});
    if (prev !== undefined) process.env.BRAIN_DB_PATH = prev;
    else delete process.env.BRAIN_DB_PATH;
    await expect(client.probe()).resolves.not.toThrow();
  });
});

describe('lifecycle: policy events emitted at each gate', () => {
  it('full run→verify path emits POLICY_DECISION events at both gates', async () => {
    const dir = makeGitRepo();
    const { taskId, sessionId } = makeFixture(dir);
    writePlan(dir, taskId, {
      commands: [`echo ok`],
      expectedFiles: [],
      verifyCommand: 'echo verified',
    });
    writeTaskState(dir, taskId, 'AWAITING_PLAN_APPROVAL');

    const executor = makeShellStepExecutor({ cwd: dir });
    await runRun({ repoRoot: dir, sessionId, taskId, executor });

    const { result } = await runRun_skipToVerify(dir, taskId, sessionId, 'VERIFYING');
    expect(result).toBe('pass');

    const events = readEvents(sessionEventsPath(dir, sessionId));
    const pdes = events.filter((e) => e.event_type === 'POLICY_DECISION');
    // At minimum: /run allow + /verify allow
    const runAllow = pdes.find((e) => e.payload.subject_name === '/run' && e.payload.decision === 'allow');
    const verifyAllow = pdes.find((e) => e.payload.subject_name === '/verify' && e.payload.decision === 'allow');
    expect(runAllow).toBeDefined();
    expect(verifyAllow).toBeDefined();
  });
});

// ── Fixture helpers ────────────────────────────────────────────────────────

async function runRun_skipToVerify(
  dir: string,
  taskId: string,
  sessionId: string,
  startState = 'VERIFYING',
): Promise<{ result: import('../../src/ccp/commands/verify').VerifyResult }> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  if (startState !== 'VERIFYING') {
    writeTaskState(dir, taskId, 'VERIFYING');
  }

  const { runVerify } = await import('../../src/ccp/commands/verify');
  return runVerify({
    repoRoot: dir,
    sessionId,
    taskId,
    runner: {
      async runCommand(cmd: string) {
        try {
          const { stdout, stderr } = await execFileAsync('sh', ['-c', cmd], { cwd: dir });
          return { exitCode: 0, stdout, stderr };
        } catch (err: any) {
          return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
        }
      },
    },
  });
}

function writeVerificationRecord(dir: string, taskId: string, result: 'pass' | 'fail') {
  const env = makeEnvelope({ taskId, artifactType: 'VerificationRecord' });
  writeArtifact(dir, taskId, 'verification', {
    ...env,
    artifact_type: 'VerificationRecord',
    commands: [{ command: 'echo test', run_at: new Date().toISOString(), exit_code: result === 'pass' ? 0 : 1, summary: result }],
    result,
    next_action: result === 'fail' ? 'fix and re-run' : null,
  });
}

function writeReviewRecord(dir: string, taskId: string, status: 'PASS' | 'FAIL') {
  const env = makeEnvelope({ taskId, artifactType: 'ReviewRecord' });
  writeArtifact(dir, taskId, 'review', {
    ...env,
    artifact_type: 'ReviewRecord',
    status,
    scope_drift: false,
    scope_drift_severity: 'no drift',
    notes: null,
    plan_step_count: 1,
    verification_result: 'pass',
  });
}
