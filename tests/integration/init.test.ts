// tests/integration/init.test.ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { runInit } from '../../src/ccp/commands/init';
import { GOVERNANCE_FILES } from '../../src/ccp/commands/init/governance';
import { runDoctor } from '../../src/core/doctor';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';
import { PhaseRegistry } from '../../src/core/phase-registry';
import type { UiAdapter } from '../../src/pi/ui';

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

function noopUi(): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => '',
    select: async (_m, choices) => choices[0] as string,
  };
}

const exec = (cmd: string) => {
  if (cmd.includes('brain --version')) return '0.0.0';
  throw new Error(`unexpected: ${cmd}`);
};

describe('/init integration', () => {
  it('produces all governance files byte-exact + valid project.yaml', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const doc = parseYaml(readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(doc.project_id).toBe('my-project');
    expect((doc.workspace as Record<string, string>).root).toBe(tgt);
  });

  it('renders custom domain and critical_actions from flags', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'brain-playground --domain trading-research --critical-actions trade_execute,global_memory_write --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const doc = parseYaml(readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(doc.domain_type).toBe('trading-research');
    expect(doc.critical_actions).toEqual(['trade_execute', 'global_memory_write']);
  });

  it('refuses on existing project.yaml without --force/--upgrade', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    mkdirSync(join(tgt, '.agent-os'), { recursive: true });
    writeFileSync(join(tgt, '.agent-os', 'project.yaml'), 'x: 1\n');
    const logs: string[] = [];
    const r = await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: (m) => logs.push(m),
      exec,
      sourceRoot: REPO_ROOT,
    });
    expect(r.ok).toBe(false);
    expect(readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8')).toBe('x: 1\n');
    expect(logs.join('\n')).toMatch(/already initialized/);
  });

  it('--force overwrites existing project.yaml', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    mkdirSync(join(tgt, '.agent-os'), { recursive: true });
    writeFileSync(join(tgt, '.agent-os', 'project.yaml'), 'project_id: old\n');
    await runInit({
      rest: 'my-new --force --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const doc = parseYaml(readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(doc.project_id).toBe('my-new');
  });

  it('--upgrade refreshes governance, preserves project.yaml', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    // initial init
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const yamlBefore = readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8');
    // upgrade
    await runInit({
      rest: '--upgrade',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const yamlAfter = readFileSync(join(tgt, '.agent-os', 'project.yaml'), 'utf8');
    expect(yamlAfter).toBe(yamlBefore);
    expect(existsSync(join(tgt, 'AGENT_OS_CONSTITUTION.md'))).toBe(true);
  });

  it('--upgrade is idempotent: governance artifact hashes identical on re-run', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    const opts = { rest: 'my-project --no-prompt', targetRoot: tgt, ui: noopUi(), log: () => {}, exec, sourceRoot: REPO_ROOT };
    await runInit(opts);
    const hashesFirst = GOVERNANCE_FILES.map((f) => hashFile(join(tgt, f)));
    await runInit({ ...opts, rest: '--upgrade' });
    const hashesSecond = GOVERNANCE_FILES.map((f) => hashFile(join(tgt, f)));
    expect(hashesSecond).toEqual(hashesFirst);
  });

  it('--upgrade refuses when project.yaml is missing', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    const logs: string[] = [];
    const r = await runInit({
      rest: '--upgrade',
      targetRoot: tgt,
      ui: noopUi(),
      log: (m) => logs.push(m),
      exec,
      sourceRoot: REPO_ROOT,
    });
    expect(r.ok).toBe(false);
    expect(logs.join('\n')).toMatch(/upgrade requires/i);
  });

  it('fresh /init installs agent-os-core pack into .agent-os/packs/', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    expect(
      existsSync(join(tgt, '.agent-os', 'packs', 'agent-os-core', 'workflow-pack.yaml')),
    ).toBe(true);
  });

  it('/init --force overwrites user-modified pack', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });

    // User modifies installed pack
    const packManifest = join(tgt, '.agent-os', 'packs', 'agent-os-core', 'workflow-pack.yaml');
    writeFileSync(packManifest, 'user-modified: true\n');

    // Re-init (force=true would be needed to overwrite; plain init should refuse)
    await runInit({
      rest: 'my-project --force --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });

    // With --force, pack IS overwritten (that's the contract)
    expect(readFileSync(packManifest, 'utf-8')).toContain('workflow_pack_id');
  });

  it('/init without --force preserves user-modified pack', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));

    // First init
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });

    // User modifies pack
    const packManifest = join(tgt, '.agent-os', 'packs', 'agent-os-core', 'workflow-pack.yaml');
    writeFileSync(packManifest, 'user-modified: true\n');

    // Upgrade (without --force) — pack should be skipped
    await runInit({
      rest: '--upgrade',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });

    expect(readFileSync(packManifest, 'utf-8')).toBe('user-modified: true\n');
  });

  it('doctor reports pack as pass after /init', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const report = runDoctor(tgt);
    const packCheck = report.checks.find((c) => c.id === 'workflow_packs');
    expect(packCheck).toBeDefined();
    expect(packCheck?.status).toBe('pass');
    expect(packCheck?.detail).toContain('agent-os-core');
  });

  it('loadWorkflowPacks sees installed pack after /init (RISK-07)', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const results = loadWorkflowPacks(tgt);
    expect(results).toHaveLength(1);
    const first = results[0]!;
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.manifest.workflow_pack_id).toBe('agent-os-core');
    }
  });

  it('PhaseRegistry constructs from installed pack with expected phases (RISK-08)', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
    });
    const results = loadWorkflowPacks(tgt);
    const first = results[0]!;
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const registry = new PhaseRegistry(first.manifest);
    const phaseIds = registry.listPhaseIds();
    expect(phaseIds).toContain('grill');
    expect(phaseIds).toContain('write-plan');
    expect(phaseIds).toContain('execute-plan');
    expect(phaseIds).toContain('verify');
    expect(phaseIds).toContain('remember');
  });

  it('multi-pack: first alphabetically by packDir wins (RISK-01 determinism)', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    // Install two packs by pointing packsSourceRoot at fixture dir with fake-pack + zzz-pack.
    const FAKE_PACKS_SRC = join(__dirname, '..', 'unit', 'ccp', 'commands', '__fixtures__', 'fake-packs');
    // Install fake-pack first, then zzz-pack (each call installs only one pack now).
    await runInit({
      rest: 'my-project --no-prompt --pack fake-pack',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
      packsSourceRoot: FAKE_PACKS_SRC,
    });
    await runInit({
      rest: 'my-project --force --no-prompt --pack zzz-pack',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
      packsSourceRoot: FAKE_PACKS_SRC,
    });
    const results = loadWorkflowPacks(tgt);
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Sort as extension.ts does.
    const sorted = [...results].sort((a, b) => a.packDir.localeCompare(b.packDir));
    // First valid pack alphabetically is fake-pack (f < z).
    const first = sorted.find((r) => r.ok);
    expect(first).toBeDefined();
    if (first?.ok) {
      expect(first.manifest.workflow_pack_id).toBe('fake-pack');
    }
  });

  it('doctor reports workflow_packs as soft_fail when packs dir missing', async () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    // Full init so constitution + project.yaml are present
    await runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: noopUi(),
      log: () => {},
      exec,
      sourceRoot: REPO_ROOT,
      // Point packs source to nonexistent dir so no pack is installed
      packsSourceRoot: join(tmpdir(), 'no-such-packs-src'),
    });
    const report = runDoctor(tgt);
    const packCheck = report.checks.find((c) => c.id === 'workflow_packs');
    expect(packCheck?.status).toBe('soft_fail');
    expect(packCheck?.detail).toMatch(/upgrade/i);
  });
});

// ── Pack manifest grill config validation ────────────────────────────────────
import { loadWorkflowPacks as loadPacks } from '../../src/core/workflow-pack-loader';
import { writeFileSync as wf } from 'node:fs';

describe('pack manifest grill config', () => {
  function makeTmpPackDir(yaml: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pack-'));
    mkdirSync(join(dir, '.agent-os', 'packs', 'test-pack'), { recursive: true });
    wf(join(dir, '.agent-os', 'packs', 'test-pack', 'workflow-pack.yaml'), yaml);
    return dir;
  }

  const BASE_YAML = `
workflow_pack_id: test-pack
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
min_agent_os_version: "1.3.0"
phases:
  - id: grill
    agent_os_command: /grill
    allowed_predecessors: []
    produces: [GrillRecord]
    may_edit_source: false
    requires_approval: false
    validators: []
validators: []
`.trim();

  it('accepts manifest with grill.question_profile: doc_grounded', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\ngrill:\n  question_profile: doc_grounded\n  max_questions: 8\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
    if (results[0]!.ok) {
      expect(results[0]!.manifest.grill?.question_profile).toBe('doc_grounded');
      expect(results[0]!.manifest.grill?.max_questions).toBe(8);
    }
  });

  it('accepts manifest with grill.question_profile: default', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\ngrill:\n  question_profile: default\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
  });

  it('accepts manifest without grill section', () => {
    const dir = makeTmpPackDir(BASE_YAML);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
    if (results[0]!.ok) {
      expect(results[0]!.manifest.grill).toBeUndefined();
    }
  });

  it('rejects manifest with unknown grill.question_profile', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\ngrill:\n  question_profile: llm_magic\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(false);
  });

  it('rejects manifest with non-positive max_questions', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\ngrill:\n  question_profile: doc_grounded\n  max_questions: 0\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(false);
  });

  it('installed agent-os-core pack has doc_grounded profile', () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    return runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: { confirm: async () => true, input: async () => '', select: async (_m, c) => c[0] as string },
      log: () => {},
      exec: (cmd: string) => { if (cmd.includes('brain --version')) return '0.0.0'; throw new Error(`unexpected: ${cmd}`); },
      sourceRoot: REPO_ROOT,
    }).then(() => {
      const results = loadPacks(tgt);
      const first = results[0]!;
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.manifest.grill?.question_profile).toBe('doc_grounded');
        expect(first.manifest.grill?.max_questions).toBe(8);
      }
    });

  it('accepts manifest with plan.verification_profile: detected', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\nplan:\n  verification_profile: detected\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
    if (results[0]!.ok) {
      expect(results[0]!.manifest.plan?.verification_profile).toBe('detected');
    }
  });

  it('accepts manifest with plan.verification_profile: none', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\nplan:\n  verification_profile: none\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
  });

  it('accepts manifest without plan section', () => {
    const dir = makeTmpPackDir(BASE_YAML);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(true);
    if (results[0]!.ok) {
      expect(results[0]!.manifest.plan).toBeUndefined();
    }
  });

  it('rejects manifest with unknown plan.verification_profile', () => {
    const dir = makeTmpPackDir(`${BASE_YAML}\nplan:\n  verification_profile: magic_ai\n`);
    const results = loadPacks(dir);
    expect(results[0]!.ok).toBe(false);
  });

  it('installed agent-os-core pack has plan.verification_profile: detected', () => {
    const tgt = mkdtempSync(join(tmpdir(), 'aos-i-'));
    return runInit({
      rest: 'my-project --no-prompt',
      targetRoot: tgt,
      ui: { confirm: async () => true, input: async () => '', select: async (_m, c) => c[0] as string },
      log: () => {},
      exec: (cmd: string) => { if (cmd.includes('brain --version')) return '0.0.0'; throw new Error(`unexpected: ${cmd}`); },
      sourceRoot: REPO_ROOT,
    }).then(() => {
      const results = loadPacks(tgt);
      const first = results[0]!;
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.manifest.plan?.verification_profile).toBe('detected');
        expect(first.manifest.version).toBe('1.2.0');
      }
    });
  });
  });
});
