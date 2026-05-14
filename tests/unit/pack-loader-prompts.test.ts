import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/pack-loader-prompts');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function makePack(name: string, yaml: string, prompts: Record<string, string | Buffer> = {}): string {
  const root = join(TMP, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const dir = join(root, '.agent-os', 'packs', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow-pack.yaml'), yaml, 'utf-8');
  for (const [rel, content] of Object.entries(prompts)) {
    const fullPath = join(dir, rel);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return root;
}

const BASE_YAML = `
workflow_pack_id: prompts-pack
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
phases:
  - id: diagnose
    agent_os_command: /diagnose
    allowed_predecessors: []
    produces: [DiagnosisRecord]
    may_edit_source: false
    requires_approval: false
    validators: []
validators: []
`;

describe('pack loader — prompts field', () => {
  it('loads a pack with no prompts field — backwards compat', () => {
    const root = makePack('p', BASE_YAML);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok');
    expect(r.manifest.prompts).toBeUndefined();
    expect(r.manifest.prompt_warnings).toEqual([]);
  });

  it('loads a pack with a present prompt file', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/01-reproduce.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml, {
      'prompts/diagnose/01-reproduce.md': '# Reproduce\nDescribe the minimal repro.',
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.id).toBe('reproduce');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.prompt_content).toContain('Describe the minimal repro');
    expect(r.manifest.prompt_warnings).toEqual([]);
  });

  it('emits a soft-fail warning when a referenced prompt file is missing', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/missing.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml); // no files written
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r?.ok) throw new Error('expected ok — missing prompts are soft-fail, not load failure');
    expect(r.manifest.prompts?.diagnose?.phases?.[0]?.prompt_content).toBeUndefined();
    expect(r.manifest.prompt_warnings.some((w) => w.includes('missing.md'))).toBe(true);
  });

  it('rejects a prompt file larger than 10KB', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/big.md
        exit_condition: reproduction_confirmed
`;
    const root = makePack('p', yaml, {
      'prompts/diagnose/big.md': 'x'.repeat(10 * 1024 + 1),
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r) throw new Error('expected a result');
    if (r.ok) throw new Error('expected ok:false for oversized prompt');
    expect(r.error).toMatch(/exceeds 10KB|too large/i);
  });

  it('rejects total prompt bytes over 200KB', () => {
    const phases = Array.from({ length: 25 }, (_, i) =>
      `      - id: p${i}\n        prompt: prompts/p${i}.md\n        exit_condition: ec${i}\n`).join('');
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
${phases}`;
    const prompts: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      prompts[`prompts/p${i}.md`] = 'y'.repeat(9 * 1024); // 25 × 9KB = 225KB total
    }
    const root = makePack('p', yaml, prompts);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r) throw new Error('expected a result');
    if (r.ok) throw new Error('expected ok:false for oversized total');
    expect(r.error).toMatch(/total.*200KB|budget/i);
  });

  it('rejects a prompt file that is not valid UTF-8', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: prompts/diagnose/bad.md
        exit_condition: ec
`;
    const root = makePack('p', yaml, {
      'prompts/diagnose/bad.md': Buffer.from([0xc3, 0x28]), // invalid UTF-8 sequence
    });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r) throw new Error('expected a result');
    if (r.ok) throw new Error('expected ok:false for non-UTF-8');
    expect(r.error).toMatch(/UTF-8/i);
  });

  it('rejects a prompt that escapes the pack directory via ..', () => {
    const yaml = `${BASE_YAML}
prompts:
  diagnose:
    phases:
      - id: reproduce
        prompt: ../escape.md
        exit_condition: ec
`;
    const root = makePack('p', yaml, { 'escape.md': 'pwned' });
    const results = loadWorkflowPacks(root);
    const r = results[0];
    if (!r) throw new Error('expected a result');
    if (r.ok) throw new Error('expected ok:false for path escape');
    expect(r.error).toMatch(/outside pack directory|invalid path/i);
  });
});
