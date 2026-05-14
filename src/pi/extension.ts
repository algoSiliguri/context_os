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
import { BrainClient } from '../ccp/brain/client';
import { runDiagnose } from '../ccp/commands/diagnose';
import { renderDoctorReport, runDoctorCommand } from '../ccp/commands/doctor';
import { runEvaluate } from '../ccp/commands/evaluate';
import { runGrill } from '../ccp/commands/grill';
import { runInit } from '../ccp/commands/init';
import { runPlan } from '../ccp/commands/plan';
import { runQuickTask } from '../ccp/commands/quick-task';
import { runRemember } from '../ccp/commands/remember';
import { runReview } from '../ccp/commands/review';
import { runRun } from '../ccp/commands/run';
import { makeShellCommandRunner } from '../ccp/commands/shared/command-runner';
import { getCurrentTaskId } from '../ccp/commands/shared/current-task';
import { createCheckpoint, restoreCheckpoint } from '../ccp/commands/shared/git-checkpoint';
import {
  approveCandidate,
  listPendingCandidates,
  rejectCandidate,
} from '../ccp/commands/shared/memory-staging';
import { defaultPlanDrafter } from '../ccp/commands/shared/plan-drafter';
import { emitPolicyDecision } from '../ccp/commands/shared/policy-decision-writer';
import { defaultQuestionGenerator } from '../ccp/commands/shared/question-generator';
import { makeShellStepExecutor } from '../ccp/commands/shared/step-executor';
import { loadTaskSessionId, loadTaskState } from '../ccp/commands/shared/task-loader';
import { runStatus } from '../ccp/commands/status';
import { runTrace } from '../ccp/commands/trace';
import { runVerify } from '../ccp/commands/verify';
import {
  type SessionApprovalCache,
  decideToolCall,
  recordTier2Approval,
} from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import { type ArtifactType, taskArtifactPath, taskDir } from '../ccp/task-paths';
import { type DetectedDoc, detectDocs } from '../core/doc-detector';
import { narrate } from '../core/narrator';
import {
  buildHeartbeatEvent,
  buildValidatorFailedEvent,
  buildValidatorPassedEvent,
  buildValidatorStartedEvent,
  buildWorkflowPackLoadFailedEvent,
  buildWorkflowPackLoadedEvent,
} from '../core/events';
import type { ProjectConfig } from '../core/manifest';
import { PackPlanDrafter } from '../core/pack-plan-drafter';
import { PackQuestionGenerator } from '../core/pack-question-generator';
import { PhaseRegistry } from '../core/phase-registry';
import { emitAndProject } from '../core/projector';
import { runValidatorsForPhase } from '../core/validator-runner';
import { type GrillConfig, type PlanConfig, type PromptPhaseDefinition, loadWorkflowPacks } from '../core/workflow-pack-loader';
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
    r.register({
      ...base,
      tool_id: id,
      capability_type: 'READ_LOCAL',
      read_or_write: 'read',
      approval_tier: 1,
    });
  }
  for (const id of ['edit', 'write'] as const) {
    r.register({
      ...base,
      tool_id: id,
      capability_type: 'WRITE_LOCAL',
      read_or_write: 'write',
      approval_tier: 2,
    });
  }
  r.register({
    ...base,
    tool_id: 'bash',
    capability_type: 'EXECUTE_LOCAL',
    read_or_write: 'write',
    approval_tier: 3,
  });
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
  return (
    basename(dir)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs → dash
      .replace(/^[^a-z]+/, '') // strip leading non-letter chars
      .replace(/-+$/, '') // strip trailing dashes
      .slice(0, 63) || 'my-project'
  );
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
  let _grillConfig: GrillConfig | undefined = undefined;
  let _planConfig: PlanConfig | undefined = undefined;
  let _diagnoseConfig: PromptPhaseDefinition[] | undefined = undefined;

  // Updates the Pi status bar with the current task state. No-op if no active task.
  function refreshStatusBar(cwd: string, taskId: string | null, ctx: any): void {
    if (!taskId || !ctx.hasUI) return;
    try {
      const state = loadTaskState(cwd, taskId) ?? 'UNKNOWN';
      ctx.ui.setStatus('agent-os', `${taskId} | ${state}`);
    } catch {
      /* best-effort */
    }
  }

  // Called at the top of every command handler. No-op after first successful load.
  // Never throws — pack loading is best-effort; existing commands must not break.
  // v1.x policy: first valid pack (sorted by packId) is the active pack; extras ignored.
  function ensurePacksLoaded(cwd: string, ctx: any): void {
    if (!cwd || _packLoadedForCwd === cwd) return;
    _packLoadedForCwd = cwd;
    _grillConfig = undefined;
    _planConfig = undefined;
    _diagnoseConfig = undefined;
    try {
      const sessionId = randomUUID();
      const packResults = loadWorkflowPacks(cwd);
      // Deterministic selection: sort by packDir basename (= packId directory name).
      const sorted = [...packResults].sort((a, b) => a.packDir.localeCompare(b.packDir));
      let activePackId: string | null = null;
      for (const result of sorted) {
        if (result.ok) {
          if (activePackId === null) {
            // First valid pack wins.
            activePackId = result.manifest.workflow_pack_id;
            _phaseRegistry = new PhaseRegistry(result.manifest);
            _grillConfig = result.manifest.grill;
            _planConfig = result.manifest.plan;
            _diagnoseConfig = result.manifest.prompts?.diagnose?.phases;
            if (ctx.hasUI) {
              ctx.ui.notify(narrate('pack', `${result.manifest.workflow_pack_id} v${result.manifest.version} loaded`), 'info');
              ctx.ui.setStatus(
                'agent-os',
                `Pack: ${result.manifest.workflow_pack_id} v${result.manifest.version}`,
              );
              setTimeout(() => ctx.ui.setStatus('agent-os', undefined), 5000);
              for (const w of result.manifest.prompt_warnings) {
                ctx.ui.notify(narrate('pack', w), 'info');
              }
            }
            try {
              emitAndProject(
                cwd,
                sessionId,
                buildWorkflowPackLoadedEvent({
                  sessionId,
                  packId: result.manifest.workflow_pack_id,
                  packVersion: result.manifest.version,
                  packDir: result.packDir,
                  phaseCount: result.manifest.phases.length,
                }),
              );
            } catch {
              /* event write best-effort */
            }
          } else {
            // Additional valid packs are ignored in v1.x.
            if (ctx.hasUI) {
              ctx.ui.notify(
                narrate('pack', `${result.manifest.workflow_pack_id} ignored — v1.x supports one active pack`),
                'info',
              );
            }
          }
        } else {
          if (ctx.hasUI) {
            ctx.ui.notify(narrate('pack', `load failed — ${result.error}`), 'error');
          }
          try {
            emitAndProject(
              cwd,
              sessionId,
              buildWorkflowPackLoadFailedEvent({
                sessionId,
                packDir: result.packDir,
                error: result.error,
              }),
            );
          } catch {
            /* event write best-effort */
          }
        }
      }
    } catch {
      /* never crash a command over pack loading */
    }
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

    const context = { taskDir: taskDir(cwd, taskId), taskId, repoRoot: cwd };
    const validatorDefs = _phaseRegistry.allValidatorDefs();
    const results = runValidatorsForPhase(validatorIds, validatorDefs, artifact, context);

    for (const { id, mode, result } of results) {
      try {
        emitAndProject(
          cwd,
          sessionId,
          buildValidatorStartedEvent({
            sessionId,
            packId: _phaseRegistry.packId,
            validatorId: id,
            phaseId,
            mode,
          }),
        );
      } catch {
        /* best-effort */
      }

      if (result.ok) {
        try {
          emitAndProject(
            cwd,
            sessionId,
            buildValidatorPassedEvent({
              sessionId,
              packId: _phaseRegistry.packId,
              validatorId: id,
              phaseId,
            }),
          );
        } catch {
          /* best-effort */
        }
        if (ctx.hasUI) {
          ctx.ui.notify(narrate('validator', `${id} passed`), 'info');
        }
      } else {
        try {
          emitAndProject(
            cwd,
            sessionId,
            buildValidatorFailedEvent({
              sessionId,
              packId: _phaseRegistry.packId,
              validatorId: id,
              phaseId,
              mode,
              findings: result.findings.map((f) => f.message),
            }),
          );
        } catch {
          /* best-effort */
        }
        const summary = result.findings.map((f) => f.message).join('; ');
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('validator', `${id} ${mode === 'advisory' ? 'advisory' : 'FAILED'}: ${summary}`),
            mode === 'advisory' ? 'info' : 'error',
          );
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
      const hasPositional = safeArgs.split(/\s+/).some((t) => t && !t.startsWith('--'));
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
        // Invalidate pack-load cache so the next command in this session picks up newly installed packs.
        _packLoadedForCwd = null;
        _grillConfig = undefined;
        _planConfig = undefined;
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
      const sessionIdArg = args.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )?.[0];
      const status = await runStatus({
        repoRoot: ctx.cwd,
        taskId: taskIdArg ?? undefined,
        sessionId: sessionIdArg ?? undefined,
        render: true,
      });
      if (status) {
        const taskId = status.task_id;
        let memLine = '';
        try {
          const pending = listPendingCandidates(ctx.cwd, taskId);
          if (pending.length > 0)
            memLine = `\n${pending.length} memory candidate(s) pending — run /memory ${taskId} to resume`;
        } catch {
          /* best-effort */
        }
        ctx.ui.notify(
          `${taskId} · ${status.current_state}\nnext: ${status.next_action}${memLine}`,
          'info',
        );
        refreshStatusBar(ctx.cwd, taskId, ctx);
      } else {
        ctx.ui.notify('No active task. Run /init if this project is not yet initialized.', 'info');
      }
    },
  });

  // ── /flight ──────────────────────────────────────────────────────────────
  pi.registerCommand('flight', {
    description: 'Show Black Box flight recorder timeline. Usage: /flight [session-id] [--tail N]',
    handler: async (args: string, ctx: any) => {
      const sessionIdArg = args.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )?.[0];
      const tailMatch = args.match(/--tail\s+(\d+)/);
      const tail = tailMatch?.[1] !== undefined ? Number.parseInt(tailMatch[1], 10) : undefined;
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

  // ── grill generator factory ──────────────────────────────────────────────
  // Shared by /grill and /flow handlers. Reads _grillConfig from loaded pack.
  // Falls back to defaultQuestionGenerator for any missing/invalid config.
  function buildGrillGenerator(
    cwd: string,
    ctx: any,
  ): { generator: ReturnType<typeof defaultQuestionGenerator>; sourceDocs: DetectedDoc[] } {
    if (!_phaseRegistry || !_grillConfig || _grillConfig.question_profile === 'default') {
      return { generator: defaultQuestionGenerator(), sourceDocs: [] };
    }
    if (_grillConfig.question_profile === 'doc_grounded') {
      let docs: DetectedDoc[] = [];
      try {
        docs = detectDocs(cwd);
      } catch (e) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Doc detection failed: ${(e as Error).message} — using default questions`,
            'info',
          );
        }
      }
      const maxQ = _grillConfig.max_questions ?? 8;
      return { generator: new PackQuestionGenerator(docs, maxQ), sourceDocs: docs };
    }
    // Unknown profile — should not reach here if manifest validation worked.
    return { generator: defaultQuestionGenerator(), sourceDocs: [] };
  }

  // ── plan drafter factory ─────────────────────────────────────────────────
  // Shared by /plan, /flow, and /continue handlers.
  function buildPlanDrafter(): ReturnType<typeof defaultPlanDrafter> {
    if (!_phaseRegistry || !_planConfig) return defaultPlanDrafter();
    if (
      _planConfig.verification_profile === 'detected' ||
      _planConfig.verification_profile === 'none'
    ) {
      return new PackPlanDrafter(_planConfig);
    }
    return defaultPlanDrafter();
  }

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
        const { generator, sourceDocs } = buildGrillGenerator(ctx.cwd, ctx);
        const { taskId } = await runGrill({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          goal,
          userType: 'non_developer',
          ui: makePiUiAdapter(ctx.ui),
          generator,
          sourceDocs,
        });
        refreshStatusBar(ctx.cwd, taskId, ctx);
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
          drafter: buildPlanDrafter(),
        });
        refreshStatusBar(ctx.cwd, taskId, ctx);
        if (outcome === 'approved') {
          ctx.ui.notify(
            `Plan approved. Edit .agent-os/tasks/${taskId}/plan.yaml to add commands if needed, then run /run.`,
            'info',
          );
        } else {
          ctx.ui.notify(
            `Plan rejected. Edit .agent-os/tasks/${taskId}/plan.yaml and run /plan again.`,
            'info',
          );
        }
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
        // Git checkpoint before run — preserves dirty tree if steps fail.
        const runSid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const ckpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
        if (ckpt.noGit) {
          ctx.ui.notify('Warning: not a git repo — no checkpoint created. Proceeding.', 'info');
          emitPolicyDecision(ctx.cwd, runSid, {
            taskId,
            subjectType: 'sandbox',
            subjectName: 'git-checkpoint',
            actionRequested: 'stash dirty files',
            decision: 'block',
            reasonCode: 'no_git',
            reason: 'not a git repo — checkpoint skipped',
            source: 'checkpoint',
          });
        } else if (ckpt.created) {
          ctx.ui.notify(
            `Checkpoint: stashed ${ckpt.dirtyFiles.length} file(s). Will restore on failure.`,
            'info',
          );
          emitPolicyDecision(ctx.cwd, runSid, {
            taskId,
            subjectType: 'sandbox',
            subjectName: 'git-checkpoint',
            actionRequested: 'stash dirty files',
            decision: 'allow',
            reasonCode: 'checkpoint_created',
            reason: `stashed ${ckpt.dirtyFiles.length} file(s) (sha: ${ckpt.sha ?? 'n/a'})`,
            source: 'checkpoint',
          });
        }

        const { outcome } = await runRun({
          repoRoot: ctx.cwd,
          sessionId: runSid,
          taskId,
          executor: makeShellStepExecutor({ cwd: ctx.cwd }),
        });
        refreshStatusBar(ctx.cwd, taskId, ctx);
        if (outcome !== 'verifying' && ckpt.created) {
          // Restore stash on failure so changes aren't lost
          const restore = await restoreCheckpoint(ctx.cwd);
          if (restore.restored) {
            ctx.ui.notify('Checkpoint restored — pre-run changes are back.', 'info');
            emitPolicyDecision(ctx.cwd, runSid, {
              taskId,
              subjectType: 'sandbox',
              subjectName: 'git-checkpoint',
              actionRequested: 'restore stash',
              decision: 'allow',
              reasonCode: 'run_failed_restore',
              reason: `run outcome=${outcome}; pre-run state restored`,
              source: 'checkpoint',
            });
          }
        }
        ctx.ui.notify(
          outcome === 'verifying'
            ? 'Execution recorded. Run /verify to check results.'
            : `/run outcome: ${outcome}. Check /status.`,
          outcome === 'verifying' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        // Attempt restore on exception
        if (typeof taskId === 'string') {
          try {
            await restoreCheckpoint(ctx.cwd);
          } catch {
            /* best-effort */
          }
        }
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
          runner: makeShellCommandRunner({ cwd: ctx.cwd }),
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
        ctx.ui.notify(
          '/diagnose requires a bug summary. Example: /diagnose login fails on Safari',
          'error',
        );
        return;
      }
      ctx.ui.setStatus('agent-os', 'diagnosing…');
      try {
        const { taskId, decision } = await runDiagnose({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          bugSummary,
          ui: makePiUiAdapter(ctx.ui),
          phasedConfig: _diagnoseConfig,
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
        ctx.ui.notify(
          '/quick-task requires a summary. Example: /quick-task fix typo in README',
          'error',
        );
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
        const msg =
          status === 'ESCALATED_TO_FULL_WORKFLOW'
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

  // ── /flow ─────────────────────────────────────────────────────────────────
  pi.registerCommand('flow', {
    description: 'Run full governed task lifecycle. Usage: /flow <goal>',
    handler: async (args: string, ctx: any) => {
      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify(
          '/flow requires a goal. Example: /flow add pagination to users list',
          'error',
        );
        return;
      }
      const ui = makePiUiAdapter(ctx.ui);
      const config = loadPolicyConfig(ctx.cwd);

      // ── grill ──
      ctx.ui.setStatus('agent-os', 'flow: grilling…');
      const { generator: grillGen, sourceDocs: grillDocs } = buildGrillGenerator(ctx.cwd, ctx);
      let taskId: string;
      try {
        ({ taskId } = await runGrill({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          goal,
          userType: 'non_developer',
          ui,
          generator: grillGen,
          sourceDocs: grillDocs,
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at grill: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);
      const proceedWithPlan = await ui.confirm(`${taskId}: grill done. Proceed with /plan?`);
      if (!proceedWithPlan) {
        ctx.ui.notify('/flow paused after grill. Run /plan when ready.', 'info');
        return;
      }

      // ── plan ──
      ctx.ui.setStatus('agent-os', 'flow: planning…');
      const planSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      let planOutcome: string;
      try {
        ({ outcome: planOutcome } = await runPlan({
          repoRoot: ctx.cwd,
          sessionId: planSessionId,
          taskId,
          ui,
          drafter: buildPlanDrafter(),
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at plan: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);
      if (planOutcome !== 'approved') {
        ctx.ui.notify(
          '/flow paused — plan not approved. Refine and run /plan, then /flow resume.',
          'info',
        );
        return;
      }
      const proceedWithRun = await ui.confirm(`${taskId}: plan approved. Proceed with /run?`);
      if (!proceedWithRun) {
        ctx.ui.notify('/flow paused after plan. Run /run when ready.', 'info');
        return;
      }

      // ── run ──
      ctx.ui.setStatus('agent-os', 'flow: running…');
      const flowCkpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
      if (!flowCkpt.noGit && flowCkpt.created) {
        ctx.ui.notify(
          `Checkpoint: stashed ${flowCkpt.dirtyFiles.length} file(s) before run.`,
          'info',
        );
      }
      let runOutcome: string;
      try {
        ({ outcome: runOutcome } = await runRun({
          repoRoot: ctx.cwd,
          sessionId: loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID(),
          taskId,
          executor: makeShellStepExecutor({ cwd: ctx.cwd }),
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        if (flowCkpt.created) {
          try {
            await restoreCheckpoint(ctx.cwd);
          } catch {
            /* best-effort */
          }
        }
        ctx.ui.notify(`/flow stopped at run: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);
      if (runOutcome !== 'verifying') {
        if (flowCkpt.created) {
          const r = await restoreCheckpoint(ctx.cwd);
          if (r.restored) ctx.ui.notify('Checkpoint restored — pre-run changes are back.', 'info');
        }
        ctx.ui.notify(
          `/flow stopped — /run outcome: ${runOutcome}. Fix and /run --resume.`,
          'error',
        );
        return;
      }

      // ── verify ──
      ctx.ui.setStatus('agent-os', 'flow: verifying…');
      let verifyResult: string;
      const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      try {
        ({ result: verifyResult } = await runVerify({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          runner: makeShellCommandRunner({ cwd: ctx.cwd }),
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at verify: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);
      if (verifyResult !== 'pass') {
        ctx.ui.notify(
          `/flow stopped — verification: ${verifyResult}. Fix and run /verify.`,
          'error',
        );
        return;
      }

      // ── review ──
      ctx.ui.setStatus('agent-os', 'flow: reviewing…');
      let reviewStatus: string;
      try {
        ({ status: reviewStatus } = await runReview({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui,
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at review: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);
      if (reviewStatus === 'FAIL' || reviewStatus === 'BLOCKED') {
        ctx.ui.notify(
          `/flow stopped — review: ${reviewStatus}. Fix and run /verify again.`,
          'error',
        );
        return;
      }

      // ── evaluate ──
      ctx.ui.setStatus('agent-os', 'flow: evaluating…');
      let taskOutcome: string;
      try {
        ({ taskOutcome } = await runEvaluate({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui,
        }));
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at evaluate: ${(e as Error).message}`, 'error');
        return;
      }
      refreshStatusBar(ctx.cwd, taskId, ctx);

      // Memory is always human-gated — never auto-run /remember
      ctx.ui.notify(
        taskOutcome !== 'FAIL'
          ? `Flow complete. ${taskId} evaluated: ${taskOutcome}. Run /remember to save learnings.`
          : 'Flow complete with FAIL evaluation. Review and decide whether to retry.',
        taskOutcome === 'FAIL' ? 'error' : 'info',
      );
    },
  });

  // ── /memory ──────────────────────────────────────────────────────────────
  // Orphan recovery: list and approve/reject pending memory candidates from
  // sessions that were interrupted before /remember completed.
  pi.registerCommand('memory', {
    description: 'Review pending memory candidates. Usage: /memory [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Pass task-id: /memory T-001', 'error');
        return;
      }
      const config = loadPolicyConfig(ctx.cwd);
      const brain = new BrainClient({
        dbPath: join(ctx.cwd, 'data_store', 'knowledge.db'),
        repoRoot: ctx.cwd,
      });
      const sid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      const pending = listPendingCandidates(ctx.cwd, taskId);
      if (pending.length === 0) {
        ctx.ui.notify(`${taskId}: no pending memory candidates.`, 'info');
        return;
      }
      ctx.ui.notify(`${taskId}: ${pending.length} pending candidate(s). Reviewing…`, 'info');
      let kept = 0;
      let dropped = 0;
      for (const candidate of pending) {
        const keep = await ctx.ui.confirm(
          'Agent OS — memory recovery',
          `[${candidate.type}/${candidate.scope}] ${candidate.content}\n  Keep?`,
        );
        if (keep) {
          try {
            const result = await brain.write({
              content: candidate.content,
              type: candidate.type,
              scope: candidate.scope,
              taskId,
              project: (config as any).project_id ?? basename(ctx.cwd),
            });
            approveCandidate(ctx.cwd, taskId, candidate.id, result.id ?? undefined);
            emitPolicyDecision(ctx.cwd, sid, {
              taskId,
              subjectType: 'memory_write',
              subjectName: candidate.id,
              actionRequested: 'write to brain (orphan recovery)',
              decision: 'approved',
              reasonCode: 'human_approved_recovery',
              reason: 'user approved orphaned memory candidate',
              approvedBy: 'human',
              memoryCandidateRefs: [candidate.id],
              source: 'memory_staging',
            });
            kept++;
          } catch {
            ctx.ui.notify(`Warning: brain unavailable — ${candidate.id} kept pending`, 'error');
          }
        } else {
          rejectCandidate(ctx.cwd, taskId, candidate.id);
          emitPolicyDecision(ctx.cwd, sid, {
            taskId,
            subjectType: 'memory_write',
            subjectName: candidate.id,
            actionRequested: 'write to brain (orphan recovery)',
            decision: 'rejected',
            reasonCode: 'human_rejected_recovery',
            reason: 'user rejected orphaned memory candidate',
            approvedBy: 'none',
            memoryCandidateRefs: [candidate.id],
            source: 'memory_staging',
          });
          dropped++;
        }
      }
      ctx.ui.notify(`Memory recovery done — kept ${kept}, dropped ${dropped}.`, 'info');
    },
  });

  // ── /continue ────────────────────────────────────────────────────────────
  // Resumes a task from its current state — dispatches to the correct next command
  // without restarting from /grill. Works for tasks started via /flow or manually.
  pi.registerCommand('continue', {
    description: 'Resume a task from current state. Usage: /continue [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Start one with /grill or /flow.', 'error');
        return;
      }
      const state = loadTaskState(ctx.cwd, taskId);
      if (!state) {
        ctx.ui.notify(`Task ${taskId} has no state. Run /status to investigate.`, 'error');
        return;
      }
      const sid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      const ui = makePiUiAdapter(ctx.ui);
      const config = loadPolicyConfig(ctx.cwd);

      switch (state) {
        case 'SHARED_UNDERSTANDING': {
          ctx.ui.notify(`${taskId} is in SHARED_UNDERSTANDING — running /plan`, 'info');
          try {
            const { outcome } = await runPlan({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              ui,
              drafter: buildPlanDrafter(),
            });
            refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              outcome === 'approved'
                ? 'Plan approved. Run /continue to proceed.'
                : 'Plan rejected. Refine and /continue.',
              outcome === 'approved' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (plan) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'AWAITING_PLAN_APPROVAL':
        case 'FAILED_RECOVERABLE': {
          ctx.ui.notify(`${taskId} is in ${state} — running /run`, 'info');
          try {
            const ckpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
            if (ckpt.created)
              ctx.ui.notify(`Checkpoint: stashed ${ckpt.dirtyFiles.length} file(s).`, 'info');
            const { outcome } = await runRun({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              executor: makeShellStepExecutor({ cwd: ctx.cwd }),
              resume: state === 'FAILED_RECOVERABLE',
            });
            refreshStatusBar(ctx.cwd, taskId, ctx);
            if (outcome !== 'verifying' && ckpt.created) {
              const r = await restoreCheckpoint(ctx.cwd);
              if (r.restored) ctx.ui.notify('Checkpoint restored.', 'info');
            }
            ctx.ui.notify(
              outcome === 'verifying'
                ? 'Run complete. /continue to verify.'
                : `Run ${outcome}. Fix and /continue.`,
              outcome === 'verifying' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (run) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'VERIFYING': {
          ctx.ui.notify(`${taskId} is in VERIFYING — running /verify`, 'info');
          try {
            const { result } = await runVerify({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              runner: makeShellCommandRunner({ cwd: ctx.cwd }),
            });
            refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              result === 'pass'
                ? 'Verified. /continue to review.'
                : `Verify ${result}. Fix and /continue.`,
              result === 'pass' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (verify) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'AWAITING_HUMAN_REVIEW': {
          ctx.ui.notify(`${taskId} is in AWAITING_HUMAN_REVIEW — running /review`, 'info');
          try {
            const { status } = await runReview({ repoRoot: ctx.cwd, sessionId: sid, taskId, ui });
            refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              status === 'PASS' || status === 'PASS_WITH_DEGRADATION'
                ? `Review ${status}. /continue to evaluate.`
                : `Review ${status}. Fix and /continue.`,
              status === 'FAIL' || status === 'BLOCKED' ? 'error' : 'info',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (review) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'EVALUATING': {
          ctx.ui.notify(`${taskId} is in EVALUATING — running /evaluate`, 'info');
          try {
            const { taskOutcome, criteriaSatisfactionRate } = await runEvaluate({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              ui,
            });
            refreshStatusBar(ctx.cwd, taskId, ctx);
            const pct = Math.round(criteriaSatisfactionRate * 100);
            ctx.ui.notify(
              `Evaluation: ${taskOutcome} (${pct}%). Run /remember to save learnings.`,
              taskOutcome === 'FAIL' ? 'error' : 'info',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (evaluate) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'PERSISTING_KNOWLEDGE': {
          ctx.ui.notify(`${taskId} is in PERSISTING_KNOWLEDGE — run /remember to complete`, 'info');
          break;
        }
        case 'DONE':
        case 'TASK_COMPLETE': {
          ctx.ui.notify(`${taskId} is ${state} — nothing to continue.`, 'info');
          break;
        }
        default: {
          ctx.ui.notify(
            `${taskId} is in ${state} — no automatic continuation for this state. Run /status.`,
            'error',
          );
        }
      }
    },
  });

  // ── tool_call policy (Phase 4) ───────────────────────────────────────────
  // Tier 1 → pass. Tier 2 → confirm once per session. Tier 3 → confirm every
  // call. Tier 4 / unknown → block (or ask if break_glass.enabled).
  //
  // Phase escalation: outside EXECUTING state, write/edit tools escalate from
  // tier-2 (approve-once) to tier-3 (approve-every-call). This prevents silent
  // file mutations during grilling, planning, verification, and review phases.
  const WRITE_TOOL_IDS = new Set(['edit', 'write', 'bash']);
  const EXECUTING_STATES = new Set(['EXECUTING']);

  pi.on('tool_call', async (event: any, ctx: any) => {
    const { toolName, input } = event as { toolName: string; input: Record<string, unknown> };
    const config = loadPolicyConfig(ctx.cwd);

    // Phase-aware tier escalation for mutating tools
    let escalatedConfig = config;
    let escalated = false;
    let escalateTaskId: string | null = null;
    let escalateState: string | null = null;
    if (WRITE_TOOL_IDS.has(toolName)) {
      try {
        escalateTaskId = getCurrentTaskId(ctx.cwd);
        if (escalateTaskId) {
          escalateState = loadTaskState(ctx.cwd, escalateTaskId);
          if (escalateState && !EXECUTING_STATES.has(escalateState)) {
            escalated = true;
            escalatedConfig = {
              ...config,
              overrides: [
                ...(config.overrides ?? []),
                { tool: toolName, when: 'matches ".*"', tier: 3 as const },
              ],
            };
          }
        }
      } catch {
        /* best-effort: fall back to base tier */
      }
    }

    const decision = decideToolCall(
      { toolName, input: input ?? {} },
      { registry, cache: sessionCache, config: escalatedConfig },
    );

    const auditSessionId = (() => {
      try {
        return (escalateTaskId && loadTaskSessionId(ctx.cwd, escalateTaskId)) || randomUUID();
      } catch {
        return randomUUID();
      }
    })();

    if (decision.outcome === 'pass') {
      if (escalated) {
        // escalated but pass means tier check still allowed (shouldn't happen in theory, but record it)
      }
      return undefined;
    }

    if (decision.outcome === 'block') {
      // Unknown tool (tier: null) → ask once; known blocked (tier 4) → hard block
      if (decision.tier === null) {
        const approved = await ctx.ui.confirm(
          'Agent OS — unknown tool',
          `Allow "${toolName}"? It is not in the built-in registry.`,
        );
        emitPolicyDecision(ctx.cwd, auditSessionId, {
          taskId: escalateTaskId ?? undefined,
          phase: escalateState ?? undefined,
          subjectType: 'tool_call',
          subjectName: toolName,
          actionRequested: 'execute',
          decision: approved ? 'approved' : 'rejected',
          reasonCode: 'unknown_tool',
          reason: `tool not in registry; user ${approved ? 'allowed' : 'denied'}`,
          riskTier: null,
          approvedBy: approved ? 'human' : 'none',
          source: 'tool_call',
        });
        return approved
          ? undefined
          : { block: true, reason: `user denied unknown tool: ${toolName}` };
      }
      emitPolicyDecision(ctx.cwd, auditSessionId, {
        taskId: escalateTaskId ?? undefined,
        phase: escalateState ?? undefined,
        subjectType: 'tool_call',
        subjectName: toolName,
        actionRequested: 'execute',
        decision: 'block',
        reasonCode: `tier_${decision.tier ?? 4}_blocked`,
        reason: decision.reason,
        riskTier: decision.tier,
        approvedBy: 'none',
        source: 'tool_call',
      });
      ctx.ui.notify(`Blocked: ${toolName} — ${decision.reason}`, 'error');
      return { block: true, reason: decision.reason };
    }

    // outcome === 'ask'
    const taskId = escalateTaskId ?? getCurrentTaskId(ctx.cwd);
    const state = escalateState ?? (taskId ? loadTaskState(ctx.cwd, taskId) : null);
    const phaseHint = state ? ` [phase: ${state}]` : '';
    if (escalated) {
      emitPolicyDecision(ctx.cwd, auditSessionId, {
        taskId: taskId ?? undefined,
        phase: state ?? undefined,
        subjectType: 'tool_call',
        subjectName: toolName,
        actionRequested: 'execute',
        decision: 'escalate',
        reasonCode: 'write_outside_executing',
        reason: `${toolName} escalated to tier-3 (current phase: ${state})`,
        riskTier: 3,
        approvedBy: 'none',
        source: 'tool_call',
      });
    }
    const approved = await ctx.ui.confirm(
      'Agent OS',
      `${toolName}: ${decision.reason}${phaseHint}`,
    );
    if (decision.cacheKey) recordTier2Approval(sessionCache, decision.cacheKey, approved);
    emitPolicyDecision(ctx.cwd, auditSessionId, {
      taskId: taskId ?? undefined,
      phase: state ?? undefined,
      subjectType: 'tool_call',
      subjectName: toolName,
      actionRequested: 'execute',
      decision: approved ? 'approved' : 'rejected',
      reasonCode: approved ? 'human_approved' : 'human_rejected',
      reason: `user ${approved ? 'approved' : 'denied'}: ${decision.reason}`,
      riskTier: decision.tier,
      approvedBy: approved ? 'human' : 'none',
      source: 'tool_call',
    });
    return approved ? undefined : { block: true, reason: `user denied: ${toolName}` };
  });

  // ── session_start ─────────────────────────────────────────────────────────
  pi.on('session_start', (_event: any, ctx: any) => {
    if (ctx.hasUI) {
      // State-aware welcome: guide user to the right next action.
      const initialized = existsSync(join(ctx.cwd, '.agent-os', 'project.yaml'));
      if (!initialized) {
        ctx.ui.notify(
          'Agent OS active. Project not initialized — run /init to set up, then /doctor.',
          'info',
        );
      } else {
        try {
          const taskId = getCurrentTaskId(ctx.cwd);
          if (taskId) {
            const state = loadTaskState(ctx.cwd, taskId) ?? 'UNKNOWN';
            const pending = listPendingCandidates(ctx.cwd, taskId);
            const memHint =
              pending.length > 0
                ? ` | ${pending.length} memory candidate(s) — /memory ${taskId}`
                : '';
            ctx.ui.notify(
              `Agent OS active. ${taskId} | ${state}${memHint} — /continue to resume, /status for details.`,
              'info',
            );
          } else {
            ctx.ui.notify(
              'Agent OS active. No active task — /flow <goal> to start, /doctor to verify setup.',
              'info',
            );
          }
        } catch {
          ctx.ui.notify('Agent OS active. Run /doctor to check project setup.', 'info');
        }
      }
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
