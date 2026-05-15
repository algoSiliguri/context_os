import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { runInit } from '../../../../src/ccp/commands/init';
import type { UiAdapter } from '../../../../src/pi/ui';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Minimal fake packs source: one valid copilot-workflow pack dir
const FAKE_PACKS_SRC = join(__dirname, '__fixtures__', 'fake-packs');

function noopUi(): UiAdapter {
  return {
    confirm: async () => true,
    input: async () => '',
    select: async (_m, choices) => choices[0] ?? '',
  };
}

describe('runInit', () => {
  it('end-to-end happy path produces project.yaml + governance dirs', async () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'aos-init-'));
    const exec = vi.fn((cmd: string) => {
      if (cmd.includes('brain --version')) return '0.0.0';
      throw new Error(`unexpected: ${cmd}`);
    });

    await runInit({
      rest: 'my-project --domain general --profile production --no-prompt --pack fake-pack',
      targetRoot,
      ui: noopUi(),
      log: () => {},
      exec,
      packsSourceRoot: FAKE_PACKS_SRC,
    });

    expect(existsSync(join(targetRoot, '.agent-os', 'project.yaml'))).toBe(true);
    expect(existsSync(join(targetRoot, 'AGENT_OS_CONSTITUTION.md'))).toBe(true);
    expect(existsSync(join(targetRoot, '.agent-os', 'runtime'))).toBe(true);
    expect(existsSync(join(targetRoot, '.agent-os', 'tasks'))).toBe(true);

    const yaml = readFileSync(join(targetRoot, '.agent-os', 'project.yaml'), 'utf8');
    expect(yaml).toContain('project_id: my-project');
    expect(yaml).toContain('verification_profile: production');

    // pack installed from fake source
    expect(
      existsSync(join(targetRoot, '.agent-os', 'packs', 'fake-pack', 'workflow-pack.yaml')),
    ).toBe(true);
  });

  it('refuses on existing project.yaml without --force/--upgrade', async () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'aos-init-'));
    mkdirSync(join(targetRoot, '.agent-os'), { recursive: true });
    writeFileSync(join(targetRoot, '.agent-os', 'project.yaml'), 'x: 1\n');
    const logs: string[] = [];
    const r = await runInit({
      rest: 'my-project --no-prompt',
      targetRoot,
      ui: noopUi(),
      log: (m) => logs.push(m),
      exec: () => '0.0.0',
    });
    expect(r.ok).toBe(false);
    expect(logs.join('\n')).toMatch(/already initialized/);
  });
});
