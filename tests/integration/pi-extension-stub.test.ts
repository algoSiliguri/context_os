import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/integration/pi-extension-stub.test.ts
import { describe, expect, it } from 'vitest';
import piExtension from '../../src/pi/extension';
import type { ExtensionAPI } from '../../src/pi/types';

function makeFakeApi(repoRoot: string) {
  const slashCommands: Record<string, (rest: string) => Promise<void>> = {};
  const tools: Record<string, (input: unknown) => Promise<unknown>> = {};
  let toolCallHandler: ((event: unknown, ctx: unknown) => Promise<unknown>) | null = null;
  const logs: string[] = [];

  return {
    api: {
      registerCommand: (name: string, opts: { description: string; handler: (args: string, ctx: any) => Promise<void> }) => {
        slashCommands[name] = (rest: string) => opts.handler(rest, { cwd: repoRoot, ui: { notify: (m: string) => logs.push(m), setStatus: () => {}, confirm: async () => true }, hasUI: false });
      },
      on: (event: string, _handler: unknown) => {
        if (event === 'tool_call') toolCallHandler = _handler as typeof toolCallHandler;
      },
      registerTool: (name: string, h: (input: unknown) => Promise<unknown>) => {
        tools[name] = h;
      },
      appendEntry: () => {},
      log: (m: string) => logs.push(m),
      repoRoot: () => repoRoot,
    },
    snapshot: () => ({
      slashCommands: Object.keys(slashCommands).sort(),
      tools: Object.keys(tools).sort(),
      hasToolCallHandler: toolCallHandler !== null,
      logs: [...logs],
    }),
    invokeSlash: async (name: string, rest: string) => {
      const h = slashCommands[name];
      if (!h) throw new Error(`no slash command ${name}`);
      await h(rest);
    },
    invokeToolCall: async (toolName: string, input: Record<string, unknown>) => {
      let blocked: string | null = null;
      const ctx = {
        cwd: repoRoot,
        ui: { notify: (m: string) => logs.push(m), setStatus: () => {}, confirm: async () => true },
      };
      const result = await (toolCallHandler as any)!({ toolName, input }, ctx);
      if (result?.block) blocked = result.reason ?? 'blocked';
      return blocked;
    },
  };
}

function setupRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-pi-int-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'project.yaml'),
    `project_id: smoke
domain_type: test
runtime_version: 0.1.0
memory_namespace: smoke
verification_profile: default
critical_actions: []
workspace:
  root: .
`,
  );
  return dir;
}

describe('Pi extension stub integration', () => {
  it('registers nine slash commands and a tool_call handler on load', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    expect(snap.slashCommands).toEqual([
      'doctor',
      'flight',
      'grill',
      'init',
      'plan',
      'remember',
      'run',
      'status',
      'verify',
    ]);
    expect(snap.hasToolCallHandler).toBe(true);
  });

  it('slash commands are registered and can be invoked without throwing', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    // /status is read-only and safe to invoke; just verify it doesn't crash
    await fake.invokeSlash('status', '');
    // Some log entry should have been produced (status output or "no active task")
    expect(fake.snapshot().logs.length).toBeGreaterThan(0);
  });

  it('tool_call handler is wired and processes unknown tools', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    // Unknown tools trigger a confirm prompt. Fake confirms true → tool is allowed (not blocked).
    // Verify the handler runs without throwing.
    const reason = await fake.invokeToolCall('truly_mystery_tool', { path: '/repo/foo.ts' });
    expect(reason).toBeNull();
  });

  it('all commands register regardless of project.yaml, tool_call handler requires config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pi-int-noconf-'));
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    // All commands and handlers register unconditionally
    expect(snap.slashCommands).toContain('init');
    expect(snap.slashCommands).toContain('grill');
    expect(snap.hasToolCallHandler).toBe(true);
  });

  it('registers /init even when project.yaml is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pi-int-noinit-'));
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    expect(snap.slashCommands).toContain('init');
    expect(snap.slashCommands).toContain('grill');
  });
});
