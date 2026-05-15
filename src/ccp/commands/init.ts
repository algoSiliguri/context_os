import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UiAdapter } from '../../pi/ui';
import { parseInitArgs } from './init/args';
import { ensureBrainCli } from './init/brain-installer';
import { GOVERNANCE_FILES, bundledGovernanceRoot, copyGovernance } from './init/governance';
import { bundledPacksSourceRoot, installBundledPacks, listBundledPackIds } from './init/pack-installer';
import { runPreflight } from './init/preflight';
import { type PromptInputs, collectPrompts } from './init/prompts';
import { renderProjectYaml } from './init/template';
import { readExtensionVersion } from './init/version';

const PACK_LABELS: Record<string, string> = {
  'engineering-core': 'engineering-core (governance + diagnose/grill discipline)',
  'agent-os-core': 'agent-os-core (governance baseline)',
};

async function selectPack(
  packId: string | undefined,
  ui: UiAdapter,
  allowPrompt: boolean,
  packsSourceRoot?: string,
): Promise<string> {
  if (packId) return packId;

  const available = listBundledPackIds(packsSourceRoot);
  if (available.length <= 1) return available[0] ?? 'agent-os-core';

  // Non-interactive fallback: safe default
  if (!allowPrompt) return 'agent-os-core';

  const labels = available.map((id) => PACK_LABELS[id] ?? id);
  const choice = await ui.select('Workflow pack to install:', labels);
  // Extract pack id: first whitespace-delimited token before any parenthesis/space
  const idMatch = choice.match(/^[a-z0-9][a-z0-9-_]*/i);
  return idMatch?.[0] ?? 'agent-os-core';
}

export interface RunInitOptions {
  rest: string;
  targetRoot: string;
  ui: UiAdapter;
  log: (msg: string) => void;
  exec?: (cmd: string) => string;
  sourceRoot?: string;
  packsSourceRoot?: string;
}

export type RunInitResult = { ok: true } | { ok: false };

export async function runInit({
  rest,
  targetRoot,
  ui,
  log,
  exec,
  sourceRoot,
  packsSourceRoot,
}: RunInitOptions): Promise<RunInitResult> {
  let parsed: ReturnType<typeof parseInitArgs>;
  try {
    parsed = parseInitArgs(rest);
  } catch (e) {
    log(`/init: ${(e as Error).message}`);
    return { ok: false };
  }

  const upgrade = parsed.flags.upgrade === true;
  const force = parsed.flags.force === true;
  const allowPrompt = parsed.flags['no-prompt'] !== true;
  const packIdFlag = parsed.flags.pack;

  const pre = runPreflight({ targetRoot, upgrade, force });
  if (!pre.ok) {
    log(`/init: ${pre.reason}`);
    return { ok: false };
  }

  if (upgrade) {
    log('[1/3] copying bundled governance files…');
    copyGovernance({ sourceRoot: sourceRoot ?? bundledGovernanceRoot(), targetRoot });
    log('[2/3] installing bundled workflow packs…');
    const upgradePackId = await selectPack(packIdFlag, ui, allowPrompt, packsSourceRoot ?? bundledPacksSourceRoot());
    installBundledPacks({
      sourceRoot: packsSourceRoot ?? bundledPacksSourceRoot(),
      targetRoot,
      force,
      packId: upgradePackId,
    });
    log('[3/3] done. project.yaml preserved.');
    return { ok: true };
  }

  const defaults: Partial<PromptInputs> = {};
  if (parsed.positional) defaults.projectId = parsed.positional;
  if (parsed.flags.domain) defaults.domainType = parsed.flags.domain;
  if (parsed.flags.profile)
    defaults.verificationProfile = parsed.flags.profile as PromptInputs['verificationProfile'];
  if (parsed.flags.namespace) defaults.memoryNamespace = parsed.flags.namespace;
  if (parsed.flags['critical-actions'] !== undefined) {
    defaults.criticalActions = parsed.flags['critical-actions']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let inputs: PromptInputs;
  try {
    inputs = await collectPrompts({ ui, defaults, allowPrompt });
  } catch (e) {
    log(`/init: ${(e as Error).message}`);
    return { ok: false };
  }

  log('[1/5] ensuring brain CLI is installed…');
  try {
    ensureBrainCli({ exec });
  } catch (e) {
    log(`/init: ${(e as Error).message}`);
    return { ok: false };
  }

  log('[2/5] copying bundled governance files…');
  copyGovernance({ sourceRoot: sourceRoot ?? bundledGovernanceRoot(), targetRoot });

  log('[3/5] creating runtime dirs…');
  mkdirSync(join(targetRoot, '.agent-os', 'runtime'), { recursive: true });
  mkdirSync(join(targetRoot, '.agent-os', 'tasks'), { recursive: true });

  // Ensure .agent-os/ and data_store/ are gitignored so git stash --include-untracked
  // doesn't stash task state during /run checkpoint creation.
  const gitignorePath = join(targetRoot, '.gitignore');
  const REQUIRED_IGNORES = ['.agent-os/', 'data_store/'];
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const lines = existing.split('\n').map((l) => l.trim());
  const missing = REQUIRED_IGNORES.filter((e) => !lines.includes(e));
  if (missing.length > 0) {
    const append = (existing && !existing.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n';
    appendFileSync(gitignorePath, append);
  }

  log('[4/5] installing bundled workflow packs…');
  const selectedPackId = await selectPack(packIdFlag, ui, allowPrompt, packsSourceRoot ?? bundledPacksSourceRoot());
  installBundledPacks({
    sourceRoot: packsSourceRoot ?? bundledPacksSourceRoot(),
    targetRoot,
    force,
    packId: selectedPackId,
  });

  log('[5/5] rendering project.yaml…');
  const yaml = renderProjectYaml({
    projectId: inputs.projectId,
    domainType: inputs.domainType,
    runtimeVersion: readExtensionVersion(),
    memoryNamespace: inputs.memoryNamespace,
    verificationProfile: inputs.verificationProfile,
    criticalActions: inputs.criticalActions,
    workspaceRoot: targetRoot,
  });
  const projectYaml = join(targetRoot, '.agent-os', 'project.yaml');
  writeFileSync(`${projectYaml}.tmp`, yaml);
  renameSync(`${projectYaml}.tmp`, projectYaml);

  log('');
  log('Done. Next:');
  log('  1. /doctor   (expect status: ok)');
  log('  2. /grill <your idea>   to walk the loop');
  log('');
  log('  Brain DB defaults to ./data_store/knowledge.db (project-local).');
  log('  To share memory across projects: export BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db"');
  log(`     ${GOVERNANCE_FILES.length} governance files copied; runtime dirs ready.`);

  return { ok: true };
}
