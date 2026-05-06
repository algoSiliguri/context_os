// tests/integration/init.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { runInit } from '../../src/ccp/commands/init';
import type { UiAdapter } from '../../src/pi/ui';

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
});
