import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';

const BUNDLED_PACK_ROOT = join(
  import.meta.dirname ?? __dirname,
  '../../src/ccp/commands/init/packs/engineering-core',
);
const TMP = join(
  import.meta.dirname ?? __dirname,
  '../../node_modules/.test-tmp/engineering-core-pack',
);

function makeFixture(): string {
  const root = join(TMP, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const packsDir = join(root, '.agent-os', 'packs');
  const targetPackDir = join(packsDir, 'engineering-core');
  mkdirSync(packsDir, { recursive: true });
  cpSync(BUNDLED_PACK_ROOT, targetPackDir, { recursive: true });
  return root;
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

describe('engineering-core pack', () => {
  it('loads cleanly with no errors', () => {
    const root = makeFixture();
    const results = loadWorkflowPacks(root);
    expect(results).toHaveLength(1);
    const r = results[0];
    if (!r) throw new Error('no result');
    if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
    expect(r.manifest.workflow_pack_id).toBe('engineering-core');
    expect(r.manifest.version).toBe('1.0.0');
  });

  it('declares all 10 phases with correct ids', () => {
    const root = makeFixture();
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r || !r.ok) throw new Error('expected ok');
    const ids = r.manifest.phases.map((p) => p.id).sort();
    expect(ids).toEqual([
      'diagnose', 'evaluate', 'execute-plan', 'grill', 'quick-task',
      'remember', 'review', 'setup-workflow', 'verify', 'write-plan',
    ]);
  });

  it('declares both new validators (falsifiable-hypothesis + no-stray-debug-tags)', () => {
    const root = makeFixture();
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r || !r.ok) throw new Error('expected ok');
    const ids = r.manifest.validators.map((v) => v.id);
    expect(ids).toContain('validate-falsifiable-hypothesis');
    expect(ids).toContain('validate-no-stray-debug-tags');
  });

  it('loads all 6 diagnose prompts and 2 grill prompts with content', () => {
    const root = makeFixture();
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r || !r.ok) throw new Error('expected ok');
    const phases = r.manifest.prompts?.diagnose?.phases;
    expect(phases).toHaveLength(6);
    for (const p of phases!) {
      expect(p.prompt_content, `phase ${p.id} should have content`).toBeDefined();
      expect(p.prompt_content!.length).toBeGreaterThan(100);
    }
    expect(r.manifest.prompts?.grill?.intro?.content).toBeDefined();
    expect(r.manifest.prompts?.grill?.intro?.content!.length).toBeGreaterThan(100);
    expect(r.manifest.prompts?.grill?.question_packs).toHaveLength(1);
    expect(r.manifest.prompts?.grill?.question_packs?.[0]?.content!.length).toBeGreaterThan(100);
    // No prompt_warnings expected — all files present
    expect(r.manifest.prompt_warnings).toEqual([]);
  });

  it('every prompt file is under 10 KB', () => {
    const promptFiles = [
      'prompts/diagnose/01-build-feedback-loop.md',
      'prompts/diagnose/02-reproduce.md',
      'prompts/diagnose/03-falsifiable-hypothesis.md',
      'prompts/diagnose/04-instrument.md',
      'prompts/diagnose/05-fix-at-seam.md',
      'prompts/diagnose/06-cleanup.md',
      'prompts/grill/intro.md',
      'prompts/grill/legacy-safe.md',
    ];
    for (const rel of promptFiles) {
      const full = join(BUNDLED_PACK_ROOT, rel);
      expect(existsSync(full), `${rel} must exist`).toBe(true);
      expect(statSync(full).size, `${rel} must be < 10KB`).toBeLessThan(10 * 1024);
    }
  });
});
