import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBuiltinValidator } from '../../src/core/validator-runner';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/no-stray-debug');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makeRepo(name: string, files: Record<string, string>): string {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

const BASE = {
  artifact_id: 'a1',
  task_id: 'T-001',
  artifact_type: 'DiagnosisRecord',
  schema_version: 1,
  created_at: '2026-05-14T10:00:00.000Z',
  bug_summary: 'x',
  reported_behavior: 'x',
  expected_behavior: 'x',
  minimal_case: 'x',
  suspected_root_cause: 'x',
  confidence: 'medium',
  decision: 'proceed',
  open_blockers: [],
};

describe('validate-no-stray-debug-tags', () => {
  it('skips non-DiagnosisRecord artifacts', () => {
    const repoDir = makeRepo('skip-non-diag', {});
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, artifact_type: 'PlanArtifact' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('passes when instrumentation_tag is missing (legacy flow)', () => {
    const repoDir = makeRepo('no-tag', { 'src/foo.ts': 'console.log("hi");' });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      BASE,
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('passes when no stray tags remain in the repo', () => {
    const repoDir = makeRepo('clean', {
      'src/foo.ts': 'console.log("regular log");',
      'src/bar.ts': 'function noop() {}',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });

  it('fails with file:line findings when a stray tag remains', () => {
    const repoDir = makeRepo('dirty', {
      'src/foo.ts': 'console.log("[DEBUG-a4f2] still here");',
      'src/clean.ts': 'console.log("nothing to see");',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toMatch(/src.foo\.ts:1/);
  });

  it('rejects a regex-special tag without escaping — tag is treated literally', () => {
    const repoDir = makeRepo('regex-special', {
      'src/foo.ts': 'console.log("[D.E.B*UG] literal");',
      'src/other.ts': 'console.log("DXEYBZUG something");',  // would match if . were wildcard
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[D.E.B*UG]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(false);
    if (!result || result.ok) return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toMatch(/src.foo\.ts/);
  });

  it('ignores common build/vcs directories', () => {
    const repoDir = makeRepo('ignored-dirs', {
      'src/clean.ts': 'console.log("ok");',
      'node_modules/dep/lib.js': 'console.log("[DEBUG-a4f2] in deps");',
      '.git/HEAD': '[DEBUG-a4f2] in git',
      'dist/bundle.js': '[DEBUG-a4f2] in dist',
    });
    const result = runBuiltinValidator(
      'validate-no-stray-debug-tags',
      { ...BASE, instrumentation_tag: '[DEBUG-a4f2]' },
      { taskDir: repoDir, taskId: 'T-001', repoRoot: repoDir },
    );
    expect(result?.ok).toBe(true);
  });
});
