import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import { readArtifact } from '../ccp/artifacts/io';
import type { PlanArtifact } from '../ccp/artifacts/plan-artifact';
import { makeShellStepExecutor } from '../ccp/commands/shared/step-executor';
import type { ProjectConfig } from '../core/manifest';
import { narrate } from '../core/narrator';
import type { UiAdapter } from './ui';

let _cachedConfig: { cwd: string; config: ProjectConfig } | null = null;

/**
 * Load policy config from .agent-os/project.yaml without using typebox Value.Check
 * (avoids v0.34/v1.1.38 cross-version issues at runtime under Pi's jiti loader).
 * Falls back to safe defaults when not initialized.
 */
export function loadPolicyConfig(cwd: string): ProjectConfig {
  if (_cachedConfig?.cwd === cwd) return _cachedConfig.config;
  let config: ProjectConfig;
  try {
    const text = readFileSync(join(cwd, '.agent-os', 'project.yaml'), 'utf-8');
    const parsed = YAML.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
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
export function dirToProjectId(dir: string): string {
  return (
    basename(dir)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/-+$/, '')
      .slice(0, 63) || 'my-project'
  );
}

/**
 * Bridge Pi's two-argument UI (title, message) to the one-argument UiAdapter
 * that Agent OS command internals expect.
 */
export function makePiUiAdapter(piUi: {
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

/**
 * Build a step executor that wraps makeShellStepExecutor and emits narrate('step', ...)
 * notifications for step start and completion/failure. Used by /run, /flow, and /continue.
 */
export function makeNarratingExecutor(
  cwd: string,
  ctx: any,
  taskId: string,
): { executeStep: (execArgs: { stepId: string; step: any }) => Promise<any> } {
  const stepInfoMap: Map<string, { title: string; risk_tier: string }> = new Map();
  try {
    const plan = readArtifact(cwd, taskId, 'plan') as unknown as PlanArtifact;
    for (const s of plan.steps) {
      stepInfoMap.set(s.id, { title: s.title, risk_tier: s.risk_tier });
    }
  } catch {
    /* plan may not exist yet — narration degrades gracefully */
  }

  const baseExecutor = makeShellStepExecutor({ cwd });
  return {
    async executeStep(execArgs: { stepId: string; step: any }) {
      const info = stepInfoMap.get(execArgs.stepId);
      const label = info
        ? `${execArgs.stepId}: ${info.title} (approval tier ${info.risk_tier ?? '?'})`
        : execArgs.stepId;
      if (ctx.hasUI) ctx.ui.notify(narrate('step', label), 'info');
      const result = await baseExecutor.executeStep(execArgs);
      if (result.status === 'completed') {
        if (ctx.hasUI) ctx.ui.notify(narrate('step', `${execArgs.stepId} completed`), 'info');
      } else {
        const reason = result.failure?.reason ?? 'step failed';
        if (ctx.hasUI) ctx.ui.notify(narrate('step', `${execArgs.stepId} failed: ${reason}`), 'error');
      }
      return result;
    },
  };
}
