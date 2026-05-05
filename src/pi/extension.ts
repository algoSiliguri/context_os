// src/pi/extension.ts
import { join } from 'node:path';
import type { SessionApprovalCache } from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import { replayFromEventLog } from '../ccp/recovery';
import { type ProjectConfig, loadProjectConfig } from '../core/manifest';
import { ALL_COMMANDS, makeAllStubs } from './slash-commands';
import { handleToolCall } from './tool-call-handler';
import type { ExtensionAPI, ExtensionEntry } from './types';
import { wrapUi } from './ui';

export interface ExtensionState {
  registry: ToolRegistry;
  cache: SessionApprovalCache;
  config: ProjectConfig;
  repoRoot: string;
}

let _state: ExtensionState | null = null;

export function getExtensionState(): ExtensionState {
  if (!_state) throw new Error('agent-os extension not initialized');
  return _state;
}

const entry: ExtensionEntry = async (api: ExtensionAPI) => {
  const repoRoot = api.repoRoot();
  let config: ProjectConfig;
  try {
    config = loadProjectConfig(join(repoRoot, '.agent-os', 'project.yaml'));
  } catch (e) {
    api.log(`agent-os: project.yaml missing or invalid (${(e as Error).message}). Extension idle.`);
    return;
  }

  // Recovery: replay events.jsonl → projection.db + session.json + per-task state.json.
  // Plan 2a treats replay failure as non-fatal: the extension still loads, but
  // the projection/snapshot files may be stale or absent. events.jsonl remains
  // the source of truth; downstream commands (Plan 2b) read live state from it.
  // Plan 2c is expected to add snapshot optimization and stricter recovery semantics.
  try {
    replayFromEventLog(repoRoot);
  } catch (e) {
    api.log(`agent-os: recovery replay failed: ${(e as Error).message}`);
  }

  _state = {
    registry: new ToolRegistry(),
    cache: new Map(),
    config,
    repoRoot,
  };

  // tool_call handler (passthrough — registry empty until Plan 2b registers tools)
  api.onToolCall(async (callCtx) => {
    if (!_state) return;
    await handleToolCall(callCtx, {
      registry: _state.registry,
      cache: _state.cache,
      config: _state.config,
      ui: wrapUi(api.ui),
    });
  });

  // Register six slash command stubs
  const stubs = makeAllStubs({ log: api.log.bind(api) });
  for (const name of ALL_COMMANDS) {
    api.registerSlashCommand(name, stubs[name]);
  }

  api.log('agent-os v1 extension loaded (Plan 2a foundation; commands are stubs).');
};

export default entry;
