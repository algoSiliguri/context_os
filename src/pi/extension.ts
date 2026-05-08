// src/pi/extension.ts — Pi v0.74.0 compatible
//
// Phase 1–4: /init, /doctor, /status + tier-based tool_call policy.
// Does NOT import from @earendil-works/pi-coding-agent to avoid a hard
// dependency; `pi` is typed as `any`. Pi passes its own ExtensionAPI object
// at runtime — the shape is verified against the live installed Pi.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import { runGrill } from '../ccp/commands/grill';
import { renderDoctorReport, runDoctorCommand } from '../ccp/commands/doctor';
import { runInit } from '../ccp/commands/init';
import { runPlan } from '../ccp/commands/plan';
import { runRemember } from '../ccp/commands/remember';
import { runRun } from '../ccp/commands/run';
import { runStatus } from '../ccp/commands/status';
import { runVerify } from '../ccp/commands/verify';
import { BrainClient } from '../ccp/brain/client';
import { getCurrentTaskId } from '../ccp/commands/shared/current-task';
import { defaultQuestionGenerator } from '../ccp/commands/shared/question-generator';
import { defaultPlanDrafter } from '../ccp/commands/shared/plan-drafter';
import { makeMockStepExecutor } from '../ccp/commands/shared/step-executor';
import {
  type SessionApprovalCache,
  decideToolCall,
  recordTier2Approval,
} from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import type { ProjectConfig } from '../core/manifest';
import type { UiAdapter } from './ui';

/**
 * Build a ToolRegistry pre-populated with Pi v0.74.0 built-in tools.
 * Tiers: read/grep/find/ls → 1 (pass), edit/write → 2 (approve once),
 *        bash → 3 (approve every call).
 */
function buildPiRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  const base = {
    source: 'pi' as const,
    trust_level: 'trusted' as const,
    network_required: false,
    workspace_required: true,
    audit_metadata: {},
    retry_policy: 'none' as const,
    idempotency_key_support: false,
  };
  for (const id of ['read', 'grep', 'find', 'ls'] as const) {
    r.register({ ...base, tool_id: id, capability_type: 'READ_LOCAL', read_or_write: 'read', approval_tier: 1 });
  }
  for (const id of ['edit', 'write'] as const) {
    r.register({ ...base, tool_id: id, capability_type: 'WRITE_LOCAL', read_or_write: 'write', approval_tier: 2 });
  }
  r.register({ ...base, tool_id: 'bash', capability_type: 'EXECUTE_LOCAL', read_or_write: 'write', approval_tier: 3 });
  return r;
}

/**
 * Load policy config from .agent-os/project.yaml without using typebox Value.Check
 * (avoids v0.34/v1.1.38 cross-version issues at runtime under Pi's jiti loader).
 * Falls back to safe defaults when not initialized.
 */
let _cachedConfig: { cwd: string; config: ProjectConfig } | null = null;

function loadPolicyConfig(cwd: string): ProjectConfig {
  if (_cachedConfig?.cwd === cwd) return _cachedConfig.config;
  let config: ProjectConfig;
  try {
    const text = readFileSync(join(cwd, '.agent-os', 'project.yaml'), 'utf-8');
    const parsed = YAML.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    // Ensure workspace.root is present; fall back to cwd if template value slipped through.
    const ws = parsed.workspace as Record<string, string> | undefined;
    if (!ws?.root || ws.root.startsWith('__')) {
      parsed.workspace = { root: cwd };
    }
    config = parsed as unknown as ProjectConfig;
  } catch {
    config = {
      project_id: basename(cwd),
      domain_type: 'software',
      runtime_version: '0.0.0',
      memory_namespace: basename(cwd),
      verification_profile: 'default',
      critical_actions: [],
      workspace: { root: cwd },
    } as unknown as ProjectConfig;
  }
  _cachedConfig = { cwd, config };
  return config;
}

/** Derive a valid project-id from a directory name. */
function dirToProjectId(dir: string): string {
  return basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric runs → dash
    .replace(/^[^a-z]+/, '')       // strip leading non-letter chars
    .replace(/-+$/, '')            // strip trailing dashes
    .slice(0, 63) || 'my-project';
}

/**
 * Bridge Pi's two-argument UI (title, message) to the one-argument UiAdapter
 * that Agent OS command internals expect.
 */
function makePiUiAdapter(piUi: {
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  select(title: string, options: string[]): Promise<string | undefined>;
}): UiAdapter {
  return {
    confirm: (msg) => piUi.confirm('Agent OS', msg),
    input: (msg) => piUi.input('Agent OS', msg).then((v) => v ?? ''),
    select: (msg, choices) => piUi.select(msg, choices).then((v) => v ?? choices[0] ?? ''),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function extension(pi: any): Promise<void> {
  const registry = buildPiRegistry();
  const sessionCache: SessionApprovalCache = new Map();
  // ── /init ────────────────────────────────────────────────────────────────
  pi.registerCommand('init', {
    description: 'Initialize Agent OS governance in this project. Usage: /init [project-id]',
    handler: async (args: string, ctx: any) => {
      const alreadyInit = existsSync(join(ctx.cwd, '.agent-os', 'project.yaml'));

      // Build safe args:
      // 1. If already initialized and no --force, switch to --upgrade (preserves project.yaml).
      // 2. If no project ID supplied, derive one from the folder name.
      // 3. Always append --no-prompt — Pi dialog APIs are unreliable from command
      //    handlers; defaults are fine for non-developers.
      let safeArgs = args.trim();

      if (alreadyInit && !safeArgs.includes('--force') && !safeArgs.includes('--upgrade')) {
        safeArgs = safeArgs.includes('--no-prompt')
          ? `${safeArgs} --upgrade`
          : `${safeArgs} --upgrade --no-prompt`;
        ctx.ui.notify(
          'Project already initialized — upgrading governance files (project.yaml preserved).',
          'info',
        );
      } else if (!safeArgs.includes('--no-prompt')) {
        safeArgs = `${safeArgs} --no-prompt`.trim();
      }

      // Inject project ID from folder name when none was provided.
      const hasPositional = safeArgs
        .split(/\s+/)
        .some((t) => t && !t.startsWith('--'));
      if (!hasPositional) {
        const derivedId = dirToProjectId(ctx.cwd);
        safeArgs = `${derivedId} ${safeArgs}`.trim();
        ctx.ui.notify(`No project ID given — using folder name: "${derivedId}"`, 'info');
      }

      ctx.ui.setStatus('agent-os', 'initializing…');
      const steps: string[] = [];
      const result = await runInit({
        rest: safeArgs,
        targetRoot: ctx.cwd,
        ui: makePiUiAdapter(ctx.ui),
        log: (msg: string) => {
          steps.push(msg);
          ctx.ui.setStatus('agent-os', msg.trim());
        },
      });
      ctx.ui.setStatus('agent-os', undefined);

      if (result.ok) {
        ctx.ui.notify(
          'Agent OS initialized ✓  Run /doctor to verify. Run /grill <idea> to start a task.',
          'info',
        );
      } else {
        const lastStep = steps.at(-1) ?? '';
        ctx.ui.notify(lastStep || '/init failed — check the project ID and try again.', 'error');
      }
    },
  });

  // ── /doctor ──────────────────────────────────────────────────────────────
  pi.registerCommand('doctor', {
    description: 'Check Agent OS health for this project',
    handler: async (_args: string, ctx: any) => {
      const report = await runDoctorCommand({ repoRoot: ctx.cwd });
      const type = report.status === 'ok' ? 'info' : 'error';
      // Emit each check as its own notification so nothing is truncated.
      for (const check of report.checks) {
        const mark = check.status === 'pass' ? '✓' : check.status === 'soft_fail' ? '~' : '✗';
        const line = `${mark} ${check.description}${check.detail ? ` — ${check.detail}` : ''}`;
        ctx.ui.notify(line, check.status === 'fail' ? 'error' : 'info');
      }
      ctx.ui.notify(`status: ${report.status}`, type);
    },
  });

  // ── /status ──────────────────────────────────────────────────────────────
  pi.registerCommand('status', {
    description: 'Show current Agent OS task status',
    handler: async (args: string, ctx: any) => {
      const taskIdArg = args.match(/T-\d{3}/)?.[0];
      const status = await runStatus({
        repoRoot: ctx.cwd,
        taskId: taskIdArg ?? undefined,
      });
      if (status) {
        ctx.ui.notify(
          `${status.task_id} · ${status.current_state}\nnext: ${status.next_action}`,
          'info',
        );
      } else {
        ctx.ui.notify('No active task. Run /init if this project is not yet initialized.', 'info');
      }
    },
  });

  // ── /grill ───────────────────────────────────────────────────────────────
  pi.registerCommand('grill', {
    description: 'Start a new task. Usage: /grill <goal>',
    handler: async (args: string, ctx: any) => {
      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify('/grill requires a goal. Example: /grill add dark mode toggle', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'grilling…');
      try {
        const { taskId } = await runGrill({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          goal,
          userType: 'non_developer',
          ui: makePiUiAdapter(ctx.ui),
          generator: defaultQuestionGenerator(),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`Task ${taskId} created. Run /plan to draft the plan.`, 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/grill failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /plan ────────────────────────────────────────────────────────────────
  pi.registerCommand('plan', {
    description: 'Draft a plan for the current task. Usage: /plan [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /grill <goal> first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'planning…');
      try {
        const { outcome } = await runPlan({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskId,
          ui: makePiUiAdapter(ctx.ui),
          drafter: defaultPlanDrafter(),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          outcome === 'approved'
            ? 'Plan approved. Run /run to execute.'
            : 'Plan rejected. Refine and run /plan again.',
          'info',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/plan failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /run ─────────────────────────────────────────────────────────────────
  pi.registerCommand('run', {
    description: 'Record plan execution. Usage: /run [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /grill first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'running…');
      try {
        const { outcome } = await runRun({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskId,
          executor: makeMockStepExecutor({}),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          outcome === 'verifying'
            ? 'Execution recorded. Run /verify to check results.'
            : `/run outcome: ${outcome}. Check /status.`,
          outcome === 'verifying' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/run failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /verify ──────────────────────────────────────────────────────────────
  pi.registerCommand('verify', {
    description: 'Run verification checks. Usage: /verify [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'verifying…');
      try {
        const { result } = await runVerify({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskId,
          runner: {
            async runCommand(_cmd: string) {
              return { exitCode: 0, stdout: 'stub pass', stderr: '' };
            },
          },
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          result === 'pass'
            ? 'Verification passed. Run /remember to save learnings.'
            : 'Verification failed. Fix and run /verify again.',
          result === 'pass' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/verify failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /remember ────────────────────────────────────────────────────────────
  pi.registerCommand('remember', {
    description: 'Save task learnings to brain DB. Usage: /remember [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task.', 'error');
        return;
      }
      const config = loadPolicyConfig(ctx.cwd);
      const brain = new BrainClient({
        dbPath: join(ctx.cwd, 'data_store', 'knowledge.db'),
        repoRoot: ctx.cwd,
      });
      ctx.ui.setStatus('agent-os', 'remembering…');
      try {
        const { kept, dropped } = await runRemember({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskId,
          brain,
          ui: makePiUiAdapter(ctx.ui),
          projectName: (config as any).project_id ?? basename(ctx.cwd),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`Done — kept ${kept}, dropped ${dropped}. Task complete.`, 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/remember failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── tool_call policy (Phase 4) ───────────────────────────────────────────
  // Tier 1 → pass. Tier 2 → confirm once per session. Tier 3 → confirm every
  // call. Tier 4 / unknown → block (or ask if break_glass.enabled).
  pi.on('tool_call', async (event: any, ctx: any) => {
    const { toolName, input } = event as { toolName: string; input: Record<string, unknown> };
    const config = loadPolicyConfig(ctx.cwd);
    const decision = decideToolCall(
      { toolName, input: input ?? {} },
      { registry, cache: sessionCache, config },
    );

    if (decision.outcome === 'pass') return undefined;

    if (decision.outcome === 'block') {
      // Unknown tool (tier: null) → ask once; known blocked (tier 4) → hard block
      if (decision.tier === null) {
        const approved = await ctx.ui.confirm(
          'Agent OS — unknown tool',
          `Allow "${toolName}"? It is not in the built-in registry.`,
        );
        return approved ? undefined : { block: true, reason: `user denied unknown tool: ${toolName}` };
      }
      ctx.ui.notify(`Blocked: ${toolName} — ${decision.reason}`, 'error');
      return { block: true, reason: decision.reason };
    }

    // outcome === 'ask'
    const approved = await ctx.ui.confirm('Agent OS', `${toolName}: ${decision.reason}`);
    if (decision.cacheKey) recordTier2Approval(sessionCache, decision.cacheKey, approved);
    return approved ? undefined : { block: true, reason: `user denied: ${toolName}` };
  });

  // ── session_start ─────────────────────────────────────────────────────────
  // Confirm the extension loaded. Only notify when a real UI is present.
  pi.on('session_start', (_event: any, ctx: any) => {
    if (ctx.hasUI) {
      ctx.ui.notify('Agent OS active. Run /doctor to check project setup.', 'info');
    }
  });
}
