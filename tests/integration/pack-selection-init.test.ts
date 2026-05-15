import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installBundledPacks, listBundledPackIds } from '../../src/ccp/commands/init/pack-installer';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/pack-selection');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

describe('init pack selection', () => {
  it('lists both bundled packs', () => {
    const ids = listBundledPackIds();
    expect(ids).toContain('agent-os-core');
    expect(ids).toContain('engineering-core');
  });

  it('installs only the selected pack when packId is provided', () => {
    const repoRoot = join(TMP, `repo-${Date.now()}`);
    mkdirSync(repoRoot, { recursive: true });
    installBundledPacks({ targetRoot: repoRoot, packId: 'engineering-core', force: false });
    expect(existsSync(join(repoRoot, '.agent-os', 'packs', 'engineering-core', 'workflow-pack.yaml'))).toBe(true);
    expect(existsSync(join(repoRoot, '.agent-os', 'packs', 'agent-os-core', 'workflow-pack.yaml'))).toBe(false);
  });

  it('falls back to agent-os-core when packId is not provided (safe default)', () => {
    const repoRoot = join(TMP, `repo-${Date.now()}`);
    mkdirSync(repoRoot, { recursive: true });
    installBundledPacks({ targetRoot: repoRoot, force: false });
    expect(existsSync(join(repoRoot, '.agent-os', 'packs', 'agent-os-core', 'workflow-pack.yaml'))).toBe(true);
    expect(existsSync(join(repoRoot, '.agent-os', 'packs', 'engineering-core', 'workflow-pack.yaml'))).toBe(false);
  });
});
