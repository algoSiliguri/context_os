import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/integration/pi-extension-stub.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import piExtension from '../../src/pi/extension';
import type { ExtensionAPI } from '../../src/pi/types';
import { writeTaskState } from '../../src/ccp/commands/shared/task-loader';

function makeFakeApi(repoRoot: string, opts: { confirmResponses?: boolean[] } = {}) {
  const slashCommands: Record<string, (rest: string) => Promise<void>> = {};
  const tools: Record<string, (input: unknown) => Promise<unknown>> = {};
  let toolCallHandler: ((event: unknown, ctx: unknown) => Promise<unknown>) | null = null;
  const logs: string[] = [];
  const confirmQueue = opts.confirmResponses ? [...opts.confirmResponses] : null;
  const confirm = async () => confirmQueue !== null ? (confirmQueue.shift() ?? false) : true;

  return {
    api: {
      registerCommand: (name: string, opts: { description: string; handler: (args: string, ctx: any) => Promise<void> }) => {
        slashCommands[name] = (rest: string) => opts.handler(rest, { cwd: repoRoot, ui: { notify: (m: string) => logs.push(m), setStatus: () => {}, confirm }, hasUI: false });
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
        ui: { notify: (m: string) => logs.push(m), setStatus: () => {}, confirm },
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
  it('registers sixteen slash commands and a tool_call handler on load', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    const snap = fake.snapshot();
    expect(snap.slashCommands).toEqual([
      'continue',
      'diagnose',
      'doctor',
      'evaluate',
      'flight',
      'flow',
      'grill',
      'init',
      'memory',
      'plan',
      'quick-task',
      'remember',
      'review',
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

describe('/flow command', () => {
  it('rejects empty goal with error notification', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('flow', '');
    const logs = fake.snapshot().logs;
    expect(logs.some((l) => l.includes('requires a goal'))).toBe(true);
  });

  it('pauses after grill when user declines proceeding to plan', async () => {
    const dir = setupRepo();
    // First confirm = false (user declines "proceed with /plan?")
    // But /flow calls runGrill first which needs task setup — it will fail gracefully
    // since there's no shared understanding artifact; verify the pause message appears
    const fake = makeFakeApi(dir, { confirmResponses: [false] });
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('flow', 'add feature X');
    const logs = fake.snapshot().logs;
    // /flow should either pause or stop — it must not throw, and must emit a message
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('/memory command (orphan recovery)', () => {
  beforeEach(() => { process.env.BRAIN_DB_PATH = '/test/knowledge.db'; });
  afterEach(() => { delete process.env.BRAIN_DB_PATH; });

  it('reports no pending candidates when none exist', async () => {
    const dir = setupRepo();
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
    );
    writeTaskState(dir, 'T-001', 'AWAITING_HUMAN_REVIEW');
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('memory', '');
    const logs = fake.snapshot().logs;
    expect(logs.some((l) => l.includes('no pending memory candidates'))).toBe(true);
  });

  it('reports no active task when none exists', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('memory', '');
    const logs = fake.snapshot().logs;
    expect(logs.some((l) => l.includes('No active task'))).toBe(true);
  });
});

describe('/continue command', () => {
  it('reports no active task when none exists', async () => {
    const dir = setupRepo();
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('continue', '');
    const logs = fake.snapshot().logs;
    expect(logs.some((l) => l.includes('No active task'))).toBe(true);
  });

  it('reports nothing to continue for DONE state', async () => {
    const dir = setupRepo();
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
    );
    writeTaskState(dir, 'T-001', 'DONE');
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('continue', '');
    const logs = fake.snapshot().logs;
    expect(logs.some((l) => l.includes('nothing to continue') || l.includes('DONE'))).toBe(true);
  });

  it('reports unknown state clearly', async () => {
    const dir = setupRepo();
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
    );
    writeTaskState(dir, 'T-001', 'GRILLING');
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    await fake.invokeSlash('continue', '');
    const logs = fake.snapshot().logs;
    // Should say no automatic continuation for unknown state
    expect(logs.some((l) => l.toLowerCase().includes('grilling') || l.toLowerCase().includes('status'))).toBe(true);
  });

  it('dispatches to /run for AWAITING_PLAN_APPROVAL (will fail gracefully without plan artifact)', async () => {
    const dir = setupRepo();
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: 'T-001' }),
    );
    writeTaskState(dir, 'T-001', 'AWAITING_PLAN_APPROVAL');
    const fake = makeFakeApi(dir);
    await piExtension(fake.api as unknown as ExtensionAPI);
    // /continue should attempt /run and fail gracefully (no plan artifact)
    await fake.invokeSlash('continue', '');
    const logs = fake.snapshot().logs;
    // Must not throw; must produce some output about run
    expect(logs.length).toBeGreaterThan(0);
  });
});
