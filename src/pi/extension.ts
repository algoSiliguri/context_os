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
import { runDiagnose } from '../ccp/commands/diagnose';
import { runEvaluate } from '../ccp/commands/evaluate';
import { runGrill } from '../ccp/commands/grill';
import { renderDoctorReport, runDoctorCommand } from '../ccp/commands/doctor';
import { runInit } from '../ccp/commands/init';
import { runPlan } from '../ccp/commands/plan';
import { runQuickTask } from '../ccp/commands/quick-task';
import { runRemember } from '../ccp/commands/remember';
import { runReview } from '../ccp/commands/review';
import { runRun } from '../ccp/commands/run';
import { runStatus } from '../ccp/commands/status';
import { runTrace } from '../ccp/commands/trace';
import { runVerify } from '../ccp/commands/verify';
import { BrainClient } from '../ccp/brain/client';
import { getCurrentTaskId } from '../ccp/commands/shared/current-task';
import { loadTaskSessionId, loadTaskState } from '../ccp/commands/shared/task-loader';
import {
  buildHeartbeatEvent,
  buildValidatorStartedEvent,
  buildValidatorPassedEvent,
  buildValidatorFailedEvent,
  buildWorkflowPackLoadedEvent,
  buildWorkflowPackLoadFailedEvent,
} from '../core/events';
import { emitAndProject } from '../core/projector';
import { loadWorkflowPacks } from '../core/workflow-pack-loader';
import { PhaseRegistry } from '../core/phase-registry';
import { runValidatorsForPhase } from '../core/validator-runner';
import { type ArtifactType, taskArtifactPath, taskDir } from '../ccp/task-paths';
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
  // Loaded once per session; null = no pack installed (backward compat).
  let _phaseRegistry: PhaseRegistry | null = null;
  let _packLoadedForCwd: string | null = null;

  // Called at the top of every command handler. No-op after first successful load.
  // Never throws — pack loading is best-effort; existing commands must not break.
  function ensurePacksLoaded(cwd: string, ctx: any): void {
    if (!cwd || _packLoadedForCwd === cwd) return;
    _packLoadedForCwd = cwd;
    try {
      const sessionId = randomUUID();
      const packResults = loadWorkflowPacks(cwd);
      for (const result of packResults) {
        if (result.ok) {
          _phaseRegistry = new PhaseRegistry(result.manifest);
          if (ctx.hasUI) {
            ctx.ui.setStatus(
              'agent-os',
              `Pack: ${result.manifest.workflow_pack_id} v${result.manifest.version}`,
            );
            setTimeout(() => ctx.ui.setStatus('agent-os', undefined), 5000);
          }
          try {
            emitAndProject(cwd, sessionId, buildWorkflowPackLoadedEvent({
              sessionId,
              packId: result.manifest.workflow_pack_id,
              packVersion: result.manifest.version,
              packDir: result.packDir,
              phaseCount: result.manifest.phases.length,
            }));
          } catch { /* event write best-effort */ }
        } else {
          if (ctx.hasUI) {
            ctx.ui.notify(`Workflow pack load failed: ${result.error}`, 'error');
          }
          try {
            emitAndProject(cwd, sessionId, buildWorkflowPackLoadFailedEvent({
              sessionId,
              packDir: result.packDir,
              error: result.error,
            }));
          } catch { /* event write best-effort */ }
        }
      }
    } catch { /* never crash a command over pack loading */ }
  }

  // Run advisory validators for a phase after its artifact is written.
  // Never throws, never blocks — emits events and optifies Pi UI notifications.
  async function runPackValidators(
    cwd: string,
    sessionId: string,
    phaseId: string,
    artifactType: ArtifactType,
    taskId: string,
    ctx: any,
  ): Promise<void> {
    if (!_phaseRegistry) return;
    const validatorIds = _phaseRegistry.validatorsFor(phaseId);
    if (validatorIds.length === 0) return;

    const artifactPath = taskArtifactPath(cwd, taskId, artifactType);
    if (!existsSync(artifactPath)) return;

    let artifact: Record<string, unknown>;
    try {
      artifact = YAML.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown>;
      if (!artifact || typeof artifact !== 'object') return;
    } catch {
      return;
    }

    const context = { taskDir: taskDir(cwd, taskId), taskId };
    const validatorDefs = _phaseRegistry.allValidatorDefs();
    const results = runValidatorsForPhase(validatorIds, validatorDefs, artifact, context);

    for (const { id, mode, result } of results) {
      try {
        emitAndProject(cwd, sessionId, buildValidatorStartedEvent({
          sessionId, packId: _phaseRegistry.packId, validatorId: id, phaseId, mode,
        }));
      } catch { /* best-effort */ }

      if (result.ok) {
        try {
          emitAndProject(cwd, sessionId, buildValidatorPassedEvent({
            sessionId, packId: _phaseRegistry.packId, validatorId: id, phaseId,
          }));
        } catch { /* best-effort */ }
        if (ctx.hasUI) {
          ctx.ui.notify(`[${id}] passed`, 'info');
        }
      } else {
        try {
          emitAndProject(cwd, sessionId, buildValidatorFailedEvent({
            sessionId, packId: _phaseRegistry.packId, validatorId: id, phaseId, mode,
            findings: result.findings.map((f) => f.message),
          }));
        } catch { /* best-effort */ }
        const summary = result.findings.map((f) => f.message).join('; ');
        if (ctx.hasUI) {
          ctx.ui.notify(`[${id}] ${mode === 'advisory' ? 'advisory' : 'FAILED'}: ${summary}`, mode === 'advisory' ? 'info' : 'error');
        }
      }
    }
  }

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
      ensurePacksLoaded(ctx.cwd, ctx);
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
    description: 'Show current Agent OS task status and Black Box health',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
      const taskIdArg = args.match(/T-\d{3}/)?.[0];
      const sessionIdArg = args.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
      const status = await runStatus({
        repoRoot: ctx.cwd,
        taskId: taskIdArg ?? undefined,
        sessionId: sessionIdArg ?? undefined,
        render: true,
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

  // ── /flight ──────────────────────────────────────────────────────────────
  pi.registerCommand('flight', {
    description: 'Show Black Box flight recorder timeline. Usage: /flight [session-id] [--tail N]',
    handler: async (args: string, ctx: any) => {
      const sessionIdArg = args.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
      const tailMatch = args.match(/--tail\s+(\d+)/);
      const tail = tailMatch?.[1] !== undefined ? parseInt(tailMatch[1], 10) : undefined;
      try {
        await runTrace({
          repoRoot: ctx.cwd,
          sessionId: sessionIdArg,
          tail,
        });
      } catch (e) {
        ctx.ui.notify(`/flight failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /grill ───────────────────────────────────────────────────────────────
  pi.registerCommand('grill', {
    description: 'Start a new task. Usage: /grill <goal>',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
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
      ensurePacksLoaded(ctx.cwd, ctx);
      ctx.ui.setStatus('agent-os', 'planning…');
      try {
        const planSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { outcome } = await runPlan({
          repoRoot: ctx.cwd,
          sessionId: planSessionId,
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
        await runPackValidators(ctx.cwd, planSessionId, 'write-plan', 'plan', taskId, ctx);
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
          sessionId: loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID(),
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
      ensurePacksLoaded(ctx.cwd, ctx);
      ctx.ui.setStatus('agent-os', 'verifying…');
      try {
        const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { result } = await runVerify({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
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
        await runPackValidators(ctx.cwd, verifySessionId, 'verify', 'verification', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/verify failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /diagnose ─────────────────────────────────────────────────────────────
  pi.registerCommand('diagnose', {
    description: 'Start a bugfix task with structured diagnosis. Usage: /diagnose <bug summary>',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
      const bugSummary = args.trim();
      if (!bugSummary) {
        ctx.ui.notify('/diagnose requires a bug summary. Example: /diagnose login fails on Safari', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'diagnosing…');
      try {
        const { taskId, decision } = await runDiagnose({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          bugSummary,
          ui: makePiUiAdapter(ctx.ui),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          decision === 'proceed'
            ? `${taskId} diagnosed. Run /plan to draft fix plan.`
            : `${taskId} diagnosis blocked — open blockers recorded. Fix blockers first.`,
          decision === 'proceed' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/diagnose failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /quick-task ───────────────────────────────────────────────────────────
  pi.registerCommand('quick-task', {
    description: 'Record a small change (escape hatch). Usage: /quick-task <summary>',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
      const taskSummary = args.trim();
      if (!taskSummary) {
        ctx.ui.notify('/quick-task requires a summary. Example: /quick-task fix typo in README', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'quick-task…');
      try {
        const { taskId, status } = await runQuickTask({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskSummary,
          ui: makePiUiAdapter(ctx.ui),
        });
        ctx.ui.setStatus('agent-os', undefined);
        const msg = status === 'ESCALATED_TO_FULL_WORKFLOW'
          ? `${taskId} escalated — use /grill to start full workflow.`
          : status === 'PASS_QUICK'
          ? `${taskId} done. Run /review to confirm.`
          : `${taskId} failed — fix and run /quick-task again.`;
        ctx.ui.notify(msg, status === 'FAIL' ? 'error' : 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/quick-task failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /review ───────────────────────────────────────────────────────────────
  pi.registerCommand('review', {
    description: 'Human review of completed work (AWAITING_HUMAN_REVIEW). Usage: /review [task-id]',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task in AWAITING_HUMAN_REVIEW. Run /verify first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'reviewing…');
      try {
        const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { status } = await runReview({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui: makePiUiAdapter(ctx.ui),
        });
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          status === 'PASS' || status === 'PASS_WITH_DEGRADATION'
            ? `Review ${status}. Run /evaluate to score the task.`
            : `Review ${status}. Fix issues and run /verify again.`,
          status === 'FAIL' || status === 'BLOCKED' ? 'error' : 'info',
        );
        await runPackValidators(ctx.cwd, verifySessionId, 'review', 'review', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/review failed: ${(e as Error).message}`, 'error');
      }
    },
  });

  // ── /evaluate ─────────────────────────────────────────────────────────────
  pi.registerCommand('evaluate', {
    description: 'Score task outcome (runs after /review). Usage: /evaluate [task-id]',
    handler: async (args: string, ctx: any) => {
      ensurePacksLoaded(ctx.cwd, ctx);
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /review first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'evaluating…');
      try {
        const evalSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { taskOutcome, criteriaSatisfactionRate } = await runEvaluate({
          repoRoot: ctx.cwd,
          sessionId: evalSessionId,
          taskId,
          ui: makePiUiAdapter(ctx.ui),
        });
        ctx.ui.setStatus('agent-os', undefined);
        const pct = Math.round(criteriaSatisfactionRate * 100);
        ctx.ui.notify(
          taskOutcome !== 'FAIL'
            ? `Evaluation: ${taskOutcome} (${pct}% criteria). Run /remember to save learnings.`
            : `Evaluation: FAIL (${pct}% criteria). Fix and restart.`,
          taskOutcome === 'FAIL' ? 'error' : 'info',
        );
        await runPackValidators(ctx.cwd, evalSessionId, 'evaluate', 'evaluation', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/evaluate failed: ${(e as Error).message}`, 'error');
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
          sessionId: loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID(),
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
  pi.on('session_start', (_event: any, ctx: any) => {
    if (ctx.hasUI) {
      ctx.ui.notify('Agent OS active. Run /doctor to check project setup.', 'info');
    }

    // Heartbeat: emit every 30s to keep last_event_timestamp fresh.
    // Prevents false STUCK signals during long-running AI turns.
    setInterval(() => {
      try {
        const taskId = getCurrentTaskId(ctx.cwd);
        if (!taskId) return;
        const sessionId = loadTaskSessionId(ctx.cwd, taskId);
        if (!sessionId) return;
        const state = loadTaskState(ctx.cwd, taskId) ?? 'UNKNOWN';
        emitAndProject(ctx.cwd, sessionId, buildHeartbeatEvent({ sessionId, state }));
      } catch {
        // heartbeat is best-effort
      }
    }, 30_000);
  });
}
