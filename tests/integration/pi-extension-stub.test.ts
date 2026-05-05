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
  let toolCallHandler:
    | ((ctx: {
        toolName: string;
        input: Record<string, unknown>;
        block(reason: string): void;
      }) => Promise<void> | void)
    | null = null;
  const logs: string[] = [];

  return {
    api: {
      ui: {
        confirm: async () => true,
        input: async () => '',
        select: async () => '',
      },
      registerTool: (name: string, h: (input: unknown) => Promise<unknown>) => {
        tools[name] = h;
      },
      registerSlashCommand: (name: string, h: (rest: string) => Promise<void>) => {
        slashCommands[name] = h;
      },
      onToolCall: (h: typeof toolCallHandler) => {
        toolCallHandler = h;
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
      await toolCallHandler!({
        toolName,
        input,
        block: (r) => {
          blocked = r;
        },
      });
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
  it('registers seven slash commands and a tool_call handler on load', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    expect(snap.slashCommands).toEqual([
      'doctor',
      'grill',
      'plan',
      'remember',
      'run',
      'status',
      'verify',
    ]);
    expect(snap.hasToolCallHandler).toBe(true);
    expect(snap.logs.some((l) => l.includes('extension loaded'))).toBe(true);
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

  it('tool_call handler blocks unknown tools after Pi defaults are seeded', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const reason = await fake.invokeToolCall('truly_mystery_tool', { path: '/repo/foo.ts' });
    expect(reason).toContain('unknown tool');
  });

  it('extension is idle when project.yaml is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pi-int-noconf-'));
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    expect(snap.slashCommands).toEqual([]);
    expect(snap.hasToolCallHandler).toBe(false);
    expect(snap.logs.some((l) => l.includes('Extension idle'))).toBe(true);
  });
});
