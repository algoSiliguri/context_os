// src/ccp/commands/init/prompts.ts
import type { UiAdapter } from '../../../pi/ui';
import { validateProjectId } from './validation';

export interface PromptInputs {
  projectId: string;
  domainType: string;
  verificationProfile: 'development' | 'production';
  memoryNamespace: string;
  criticalActions: string[];
}

export interface CollectPromptsOptions {
  ui: UiAdapter;
  defaults: Partial<PromptInputs>;
  allowPrompt: boolean;
}

const MAX_RETRIES = 3;

export async function collectPrompts({
  ui,
  defaults,
  allowPrompt,
}: CollectPromptsOptions): Promise<PromptInputs> {
  let projectId = defaults.projectId;
  if (!projectId) {
    if (!allowPrompt)
      throw new Error('project_id is required (positional or --no-prompt requires all values)');
    for (let i = 0; i < MAX_RETRIES; i++) {
      const v = (await ui.input('project_id (lowercase, kebab-case):')).trim();
      const err = validateProjectId(v);
      if (!err) {
        projectId = v;
        break;
      }
    }
    if (!projectId) throw new Error('project_id was not provided after multiple attempts');
  } else {
    const err = validateProjectId(projectId);
    if (err) throw new Error(err);
  }

  const domainType =
    defaults.domainType ??
    (allowPrompt ? (await ui.input('domain_type [general]:')).trim() || 'general' : 'general');

  const verificationProfile =
    defaults.verificationProfile ??
    (allowPrompt
      ? ((await ui.select('verification_profile:', [
          'production',
          'development',
        ])) as PromptInputs['verificationProfile'])
      : 'production');

  const memoryNamespace =
    defaults.memoryNamespace ??
    (allowPrompt
      ? (await ui.input(`memory_namespace [${projectId}]:`)).trim() || projectId
      : projectId);

  let criticalActions = defaults.criticalActions;
  if (!criticalActions) {
    if (allowPrompt) {
      const raw = (await ui.input('critical_actions (comma-separated, optional):')).trim();
      criticalActions =
        raw === ''
          ? []
          : raw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
    } else {
      criticalActions = [];
    }
  }

  return { projectId, domainType, verificationProfile, memoryNamespace, criticalActions };
}
