import { spawn as nodeSpawn } from 'node:child_process';
// src/pi/extension.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionStatus } from '../ccp/artifacts/session-status';
import { BrainClient } from '../ccp/brain/client';
import { renderDoctorReport, runDoctorCommand } from '../ccp/commands/doctor';
import { runGrill } from '../ccp/commands/grill';
import { runPlan } from '../ccp/commands/plan';
import { runRemember } from '../ccp/commands/remember';
import { runRun } from '../ccp/commands/run';
import { getCurrentTaskId } from '../ccp/commands/shared/current-task';
import { runStatus } from '../ccp/commands/status';
import { runVerify } from '../ccp/commands/verify';
import type { SessionApprovalCache } from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import { replayFromEventLog } from '../ccp/recovery';
import { type PiAgentLike, makePiAgentExecutor } from '../ccp/tools/pi-agent-executor';
import { seedPiTools } from '../ccp/tools/pi-tool-defaults';
import { type ProjectConfig, loadProjectConfig } from '../core/manifest';
import { sessionSnapshotPath } from '../core/runtime-paths';
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

  // tool_call handler
  api.onToolCall(async (callCtx) => {
    if (!_state) return;
    await handleToolCall(callCtx, {
      registry: _state.registry,
      cache: _state.cache,
      config: _state.config,
      ui: wrapUi(api.ui),
    });
  });

  seedPiTools(_state.registry);

  const sessionId = readSessionId(_state.repoRoot);
  const ui = wrapUi(api.ui);
  const brain = new BrainClient({
    dbPath: process.env.BRAIN_DB_PATH ?? '',
    repoRoot: _state.repoRoot,
  });
  const projectName = _state.config.project_id;

  const piAgent: PiAgentLike = {
    async runAgent(prompt) {
      if (typeof api.runAgentTurn === 'function') {
        const result = await api.runAgentTurn(prompt);
        const exitCode = result.exitCode ?? 1;
        const errorSummary =
          result.errorSummary ??
          (result.exitCode === undefined
            ? 'agent returned malformed result (no exitCode)'
            : undefined);
        return {
          filesChanged: result.filesChanged ?? [],
          commandsRun: result.commandsRun ?? [],
          exitCode,
          ...(errorSummary ? { errorSummary } : {}),
        };
      }
      // Fallback when Pi's runAgentTurn isn't on the API surface (development, tests).
      api.log(`[pi-agent stub — no runAgentTurn available]\n${prompt}`);
      return {
        filesChanged: [],
        commandsRun: [],
        exitCode: 1,
        errorSummary: 'Pi host has no runAgentTurn; /run cannot drive steps',
      };
    },
  };

  const executor = makePiAgentExecutor({ agent: piAgent });

  api.registerSlashCommand('doctor', async () => {
    const report = await runDoctorCommand({ repoRoot: _state!.repoRoot });
    api.log(renderDoctorReport(report));
  });

  api.registerSlashCommand('grill', async (rest: string) => {
    await runGrill({
      repoRoot: _state!.repoRoot,
      sessionId,
      goal: rest.trim(),
      userType: 'developer',
      ui,
    });
  });

  api.registerSlashCommand('plan', async () => {
    const taskId = getCurrentTaskId(_state!.repoRoot);
    if (!taskId) {
      api.log('no active task');
      return;
    }
    await runPlan({ repoRoot: _state!.repoRoot, sessionId, taskId, ui });
  });

  api.registerSlashCommand('run', async (rest: string) => {
    const args = rest.split(/\s+/).filter(Boolean);
    const resume = args.includes('--resume');
    const taskIdArg = args.find((a) => /^T-\d{3}$/.test(a));
    const taskId = taskIdArg ?? getCurrentTaskId(_state!.repoRoot);
    if (!taskId) {
      api.log('no active task');
      return;
    }
    const result = await runRun({
      repoRoot: _state!.repoRoot,
      sessionId,
      taskId,
      executor,
      resume,
    });
    if (result.outcome === 'verifying') {
      await runVerify({
        repoRoot: _state!.repoRoot,
        sessionId,
        taskId,
        runner: nodeCommandRunner(),
      });
    }
  });

  api.registerSlashCommand('verify', async () => {
    const taskId = getCurrentTaskId(_state!.repoRoot);
    if (!taskId) {
      api.log('no active task');
      return;
    }
    await runVerify({ repoRoot: _state!.repoRoot, sessionId, taskId, runner: nodeCommandRunner() });
  });

  api.registerSlashCommand('remember', async () => {
    const taskId = getCurrentTaskId(_state!.repoRoot);
    if (!taskId) {
      api.log('no active task');
      return;
    }
    await runRemember({ repoRoot: _state!.repoRoot, sessionId, taskId, brain, ui, projectName });
  });

  api.registerSlashCommand('status', async (rest: string) => {
    const taskIdArg = rest.match(/T-\d{3}/)?.[0];
    const status = await runStatus({ repoRoot: _state!.repoRoot, taskId: taskIdArg ?? undefined });
    api.log(status ? renderStatus(status) : 'no active task');
  });

  api.log('agent-os v1 extension loaded (Plan 2b commands wired; Pi tools seeded).');
};

function readSessionId(repoRoot: string): string {
  const path = sessionSnapshotPath(repoRoot);
  if (!existsSync(path)) return 'sess-unset';
  try {
    const obj = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof obj.session_id === 'string' ? obj.session_id : 'sess-unset';
  } catch {
    return 'sess-unset';
  }
}

function nodeCommandRunner() {
  return {
    runCommand: async (cmd: string) => {
      return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
        const proc = nodeSpawn(cmd, { shell: true });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => {
          stdout += String(d);
        });
        proc.stderr?.on('data', (d) => {
          stderr += String(d);
        });
        proc.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
      });
    },
  };
}

function renderStatus(s: SessionStatus): string {
  return `${s.task_id} · ${s.current_state}\nnext: ${s.next_action}`;
}

export default entry;
