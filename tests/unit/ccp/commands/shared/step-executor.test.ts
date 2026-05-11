import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type StepExecutor,
  makeMockStepExecutor,
  makeShellStepExecutor,
} from '../../../../../src/ccp/commands/shared/step-executor';

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-git-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // Initial commit so HEAD exists
  writeFileSync(join(dir, 'README.md'), 'init', 'utf-8');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('makeMockStepExecutor', () => {
  it('returns success when scripted to succeed', async () => {
    const exec: StepExecutor = makeMockStepExecutor({
      'S-1': { status: 'completed', files_changed: ['src/foo.ts'], commands_run: ['npm install'] },
    });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [], expected_files: [] } as never,
    });
    expect(r.status).toBe('completed');
    expect(r.files_changed).toContain('src/foo.ts');
  });

  it('returns recoverable failure when scripted', async () => {
    const exec = makeMockStepExecutor({
      'S-1': {
        status: 'failed',
        failure: { reason: 'test_failed', summary: 'one test failed', recoverable: true },
      },
    });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [], expected_files: [] } as never,
    });
    expect(r.status).toBe('failed');
    expect(r.failure?.reason).toBe('test_failed');
  });
});

describe('makeShellStepExecutor', () => {
  it('runs a real command and returns completed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-shell-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'echo hello', approval_tier: 1 }],
        expected_files: [],
      },
    });
    expect(r.status).toBe('completed');
    expect(r.commands_run).toContain('echo hello');
    expect(r.failure).toBeNull();
  });

  it('records expected_files as files_changed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-shell-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'true', approval_tier: 1 }],
        expected_files: [{ path: 'src/foo.ts', operation: 'modify' }],
      },
    });
    expect(r.status).toBe('completed');
    expect(r.files_changed).toContain('src/foo.ts');
  });

  it('returns recoverable failure on non-zero exit', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-shell-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'exit 42', approval_tier: 2 }],
        expected_files: [],
      },
    });
    expect(r.status).toBe('failed');
    expect(r.failure?.reason).toMatch(/cmd_exit_/);
    expect(r.failure?.recoverable).toBe(true);
  });

  it('stops at first failing command in multi-command step', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-shell-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [
          { command: 'exit 1', approval_tier: 1 },
          { command: 'echo should_not_run', approval_tier: 1 },
        ],
        expected_files: [],
      },
    });
    expect(r.status).toBe('failed');
    expect(r.commands_run).toHaveLength(1);
  });

  it('step with no commands returns completed', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-shell-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [], expected_files: [] },
    });
    expect(r.status).toBe('completed');
  });

  it('non-git dir → scope_result is non_git_unverifiable', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aos-nongit-'));
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'echo x', approval_tier: 1 }],
        expected_files: [{ path: 'src/foo.ts', operation: 'modify' }],
      },
    });
    expect(r.status).toBe('completed');
    expect(r.scope_result).toBe('non_git_unverifiable');
  });

  it('git repo: command only changes declared file → exact_match', async () => {
    const cwd = makeGitRepo();
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'echo changed > declared.txt', approval_tier: 1 }],
        expected_files: [{ path: 'declared.txt', operation: 'create' }],
      },
    });
    expect(r.status).toBe('completed');
    expect(r.scope_result).toMatch(/exact_match|subset_match|no_changes/);
  });

  it('git repo: command changes extra undeclared file → extra_files_detected → failed', async () => {
    const cwd = makeGitRepo();
    // Create the extra file first so it's tracked
    writeFileSync(join(cwd, 'extra.txt'), 'original', 'utf-8');
    execFileSync('git', ['add', 'extra.txt'], { cwd });
    execFileSync('git', ['commit', '-q', '-m', 'add extra'], { cwd });

    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        // Command modifies extra.txt (tracked) but only declares declared.txt
        commands: [{ command: 'echo changed > extra.txt', approval_tier: 1 }],
        expected_files: [{ path: 'declared.txt', operation: 'modify' }],
      },
    });
    expect(r.status).toBe('failed');
    expect(r.scope_result).toBe('extra_files_detected');
    expect(r.failure?.reason).toBe('scope_violation');
    expect(r.incidental_files).toContain('extra.txt');
  });

  it('git repo: read-only declared files do not trigger scope violation', async () => {
    const cwd = makeGitRepo();
    const exec = makeShellStepExecutor({ cwd });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: {
        // No files actually changed, only a read-only declared file
        commands: [{ command: 'echo x', approval_tier: 1 }],
        expected_files: [{ path: 'README.md', operation: 'read' }],
      },
    });
    expect(r.status).toBe('completed');
    // read-only files are excluded from declared set → no_changes is fine
    expect(r.scope_result).toMatch(/no_changes|non_git_unverifiable/);
  });
});
