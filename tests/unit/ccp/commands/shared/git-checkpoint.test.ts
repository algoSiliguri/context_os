import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createCheckpoint,
  restoreCheckpoint,
} from '../../../../../src/ccp/commands/shared/git-checkpoint';

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-ckpt-'));
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // Initial commit so HEAD exists
  writeFileSync(join(dir, 'README.md'), 'init');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

describe('createCheckpoint', () => {
  it('returns noGit=true for non-git directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-nogit-'));
    const r = await createCheckpoint(dir, 'test');
    expect(r.noGit).toBe(true);
    expect(r.created).toBe(false);
  });

  it('does not create checkpoint for clean tree', async () => {
    const dir = makeGitRepo();
    const r = await createCheckpoint(dir, 'agent-os-checkpoint: T-001');
    expect(r.created).toBe(false);
    expect(r.noGit).toBe(false);
    expect(r.dirtyFiles).toHaveLength(0);
    expect(r.sha).toBeTruthy();
  });

  it('stashes dirty files and returns dirtyFiles list', async () => {
    const dir = makeGitRepo();
    writeFileSync(join(dir, 'dirty.txt'), 'modified');
    const r = await createCheckpoint(dir, 'agent-os-checkpoint: T-001');
    expect(r.created).toBe(true);
    expect(r.dirtyFiles).toContain('dirty.txt');
    expect(r.sha).toBeTruthy();
  });

  it('restoreCheckpoint restores stashed files', async () => {
    const dir = makeGitRepo();
    writeFileSync(join(dir, 'restore-me.txt'), 'content');
    await createCheckpoint(dir, 'agent-os-checkpoint: T-001');
    // File should be stashed (gone)
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(dir, 'restore-me.txt'))).toBe(false);
    const r = await restoreCheckpoint(dir);
    expect(r.restored).toBe(true);
    expect(existsSync(join(dir, 'restore-me.txt'))).toBe(true);
  });

  it('restoreCheckpoint declines non-agent-os stash', async () => {
    const dir = makeGitRepo();
    writeFileSync(join(dir, 'other.txt'), 'x');
    execFileSync('git', ['stash', 'push', '-m', 'some-other-stash'], { cwd: dir });
    const r = await restoreCheckpoint(dir);
    expect(r.restored).toBe(false);
    expect(r.reason).toMatch(/not an agent-os checkpoint/);
  });
});
