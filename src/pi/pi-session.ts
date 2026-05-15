import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import type { SessionApprovalCache } from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import { type ArtifactType, taskArtifactPath, taskDir } from '../ccp/task-paths';
import { loadTaskState } from '../ccp/commands/shared/task-loader';
import { type DraftedPlan, defaultPlanDrafter } from '../ccp/commands/shared/plan-drafter';
import { defaultQuestionGenerator } from '../ccp/commands/shared/question-generator';
import { type DetectedDoc, detectDocs } from '../core/doc-detector';
import { narrate } from '../core/narrator';
import { PackPlanDrafter } from '../core/pack-plan-drafter';
import { PackQuestionGenerator } from '../core/pack-question-generator';
import { PhaseRegistry } from '../core/phase-registry';
import { emitAndProject } from '../core/projector';
import { runValidatorsForPhase } from '../core/validator-runner';
import {
  buildValidatorFailedEvent,
  buildValidatorPassedEvent,
  buildValidatorStartedEvent,
  buildWorkflowPackLoadFailedEvent,
  buildWorkflowPackLoadedEvent,
} from '../core/events';
import {
  type GrillConfig,
  type PlanConfig,
  type PromptPhaseDefinition,
  loadWorkflowPacks,
} from '../core/workflow-pack-loader';

export class PiSession {
  phaseRegistry: PhaseRegistry | null = null;
  packLoadedForCwd: string | null = null;
  grillConfig: GrillConfig | undefined;
  planConfig: PlanConfig | undefined;
  diagnoseConfig: PromptPhaseDefinition[] | undefined;
  readonly registry: ToolRegistry;
  readonly sessionCache: SessionApprovalCache;

  constructor(registry: ToolRegistry, sessionCache: SessionApprovalCache) {
    this.registry = registry;
    this.sessionCache = sessionCache;
  }

  refreshStatusBar(cwd: string, taskId: string | null, ctx: any): void {
    if (!taskId || !ctx.hasUI) return;
    try {
      const state = loadTaskState(cwd, taskId) ?? 'UNKNOWN';
      ctx.ui.setStatus('agent-os', `${taskId} | ${state}`);
    } catch {
      /* best-effort */
    }
  }

  ensurePacksLoaded(cwd: string, ctx: any): void {
    if (!cwd || this.packLoadedForCwd === cwd) return;
    this.packLoadedForCwd = cwd;
    this.grillConfig = undefined;
    this.planConfig = undefined;
    this.diagnoseConfig = undefined;
    try {
      const sessionId = randomUUID();
      const packResults = loadWorkflowPacks(cwd);
      const sorted = [...packResults].sort((a, b) => a.packDir.localeCompare(b.packDir));
      let activePackId: string | null = null;
      for (const result of sorted) {
        if (result.ok) {
          if (activePackId === null) {
            activePackId = result.manifest.workflow_pack_id;
            this.phaseRegistry = new PhaseRegistry(result.manifest);
            this.grillConfig = result.manifest.grill;
            this.planConfig = result.manifest.plan;
            this.diagnoseConfig = result.manifest.prompts?.diagnose?.phases;
            if (ctx.hasUI) {
              ctx.ui.notify(narrate('pack', `${result.manifest.workflow_pack_id} v${result.manifest.version} loaded`), 'info');
              ctx.ui.setStatus('agent-os', `Pack: ${result.manifest.workflow_pack_id} v${result.manifest.version}`);
              setTimeout(() => ctx.ui.setStatus('agent-os', undefined), 5000);
              for (const w of result.manifest.prompt_warnings) {
                ctx.ui.notify(narrate('pack', w), 'info');
              }
            }
            try {
              emitAndProject(cwd, sessionId, buildWorkflowPackLoadedEvent({
                sessionId,
                packId: result.manifest.workflow_pack_id,
                packVersion: result.manifest.version,
                packDir: result.packDir,
                phaseCount: result.manifest.phases.length,
              }));
            } catch {
              /* event write best-effort */
            }
          } else {
            if (ctx.hasUI) {
              ctx.ui.notify(narrate('pack', `${result.manifest.workflow_pack_id} ignored — v1.x supports one active pack`), 'info');
            }
          }
        } else {
          if (ctx.hasUI) {
            ctx.ui.notify(narrate('pack', `load failed — ${result.error}`), 'error');
          }
          try {
            emitAndProject(cwd, sessionId, buildWorkflowPackLoadFailedEvent({
              sessionId,
              packDir: result.packDir,
              error: result.error,
            }));
          } catch {
            /* event write best-effort */
          }
        }
      }
    } catch {
      /* never crash a command over pack loading */
    }
  }

  async runPackValidators(
    cwd: string,
    sessionId: string,
    phaseId: string,
    artifactType: ArtifactType,
    taskId: string,
    ctx: any,
  ): Promise<void> {
    if (!this.phaseRegistry) return;
    const validatorIds = this.phaseRegistry.validatorsFor(phaseId);
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
    const validatorDefs = this.phaseRegistry.allValidatorDefs();
    const results = runValidatorsForPhase(validatorIds, validatorDefs, artifact, context);

    for (const { id, mode, result } of results) {
      try {
        emitAndProject(cwd, sessionId, buildValidatorStartedEvent({
          sessionId, packId: this.phaseRegistry.packId, validatorId: id, phaseId, mode,
        }));
      } catch {
        /* best-effort */
      }
      if (result.ok) {
        try {
          emitAndProject(cwd, sessionId, buildValidatorPassedEvent({
            sessionId, packId: this.phaseRegistry.packId, validatorId: id, phaseId,
          }));
        } catch {
          /* best-effort */
        }
        if (ctx.hasUI) ctx.ui.notify(narrate('validator', `${id} passed`), 'info');
      } else {
        try {
          emitAndProject(cwd, sessionId, buildValidatorFailedEvent({
            sessionId,
            packId: this.phaseRegistry.packId,
            validatorId: id,
            phaseId,
            mode,
            findings: result.findings.map((f) => f.message),
          }));
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

  buildGrillGenerator(
    cwd: string,
    ctx: any,
  ): { generator: ReturnType<typeof defaultQuestionGenerator>; sourceDocs: DetectedDoc[] } {
    if (!this.phaseRegistry || !this.grillConfig || this.grillConfig.question_profile === 'default') {
      return { generator: defaultQuestionGenerator(), sourceDocs: [] };
    }
    if (this.grillConfig.question_profile === 'doc_grounded') {
      let docs: DetectedDoc[] = [];
      try {
        docs = detectDocs(cwd);
      } catch (e) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Doc detection failed: ${(e as Error).message} — using default questions`, 'info');
        }
      }
      if (docs.length > 0 && ctx.hasUI) {
        const shown = docs.slice(0, 5).map((d) => d.path);
        const extra = docs.length > 5 ? ` … +${docs.length - 5} more` : '';
        ctx.ui.notify(narrate('doc', `using ${shown.join(', ')}${extra} as grounding source${docs.length === 1 ? '' : 's'}`), 'info');
      }
      const maxQ = this.grillConfig.max_questions ?? 8;
      return { generator: new PackQuestionGenerator(docs, maxQ), sourceDocs: docs };
    }
    return { generator: defaultQuestionGenerator(), sourceDocs: [] };
  }

  buildPlanDrafter(): ReturnType<typeof defaultPlanDrafter> {
    if (!this.phaseRegistry || !this.planConfig) return defaultPlanDrafter();
    if (
      this.planConfig.verification_profile === 'detected' ||
      this.planConfig.verification_profile === 'none'
    ) {
      return new PackPlanDrafter(this.planConfig);
    }
    return defaultPlanDrafter();
  }
}
