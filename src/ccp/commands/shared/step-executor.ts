// src/ccp/commands/shared/step-executor.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandOutput {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export type ScopeResult =
  | 'exact_match'
  | 'subset_match'
  | 'extra_files_detected'
  | 'missing_expected_changes'
  | 'no_changes'
  | 'non_git_unverifiable';

export interface StepExecutionResult {
  status: 'completed' | 'failed';
  files_changed: string[];
  commands_run: string[];
  command_outputs: CommandOutput[];
  approvals: Array<{ tool: string; decided_by: string; at: string }>;
  events: string[];
  failure: null | {
    reason: string;
    summary: string;
    recoverable?: boolean;
    raw_output_ref?: string;
  };
  scope_result?: ScopeResult;
  files_declared?: string[];
  files_observed?: string[];
  incidental_files?: string[];
  scope_violation_reason?: string;
}

export interface StepExecutor {
  executeStep(args: {
    stepId: string;
    step: {
      commands: Array<{ command: string; approval_tier: 1 | 2 | 3 | 4 }>;
      expected_files: Array<{ path: string; operation: 'read' | 'create' | 'modify' | 'delete' }>;
    };
  }): Promise<StepExecutionResult>;
}

export function makeMockStepExecutor(
  scripted: Record<string, Partial<StepExecutionResult>>,
): StepExecutor {
  return {
    async executeStep({ stepId }) {
      const s = scripted[stepId] ?? {};
      return {
        status: s.status ?? 'completed',
        files_changed: s.files_changed ?? [],
        commands_run: s.commands_run ?? [],
        command_outputs: s.command_outputs ?? [],
        approvals: s.approvals ?? [],
        events: s.events ?? [],
        failure: s.failure ?? null,
      };
    },
  };
}

export interface ShellExecutorOptions {
  cwd: string;
  timeout?: number;
}

async function gitChangedFiles(cwd: string): Promise<{ files: string[]; isGit: boolean }> {
  try {
    const [tracked, untracked] = await Promise.all([
      execFileAsync('git', ['diff', '--name-only', 'HEAD'], { cwd }).then((r) => r.stdout.trim()),
      execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], { cwd }).then((r) => r.stdout.trim()),
    ]);
    const files = [
      ...tracked.split('\n'),
      ...untracked.split('\n'),
    ].map((f) => f.trim()).filter(Boolean);
    return { files, isGit: true };
  } catch {
    return { files: [], isGit: false };
  }
}

function classifyScope(
  declared: string[],
  observed: string[],
): { result: ScopeResult; extra: string[]; missing: string[]; reason?: string } {
  const declaredSet = new Set(declared);
  const observedSet = new Set(observed);

  const extra = observed.filter((f) => !declaredSet.has(f));
  const missing = declared.filter((f) => !observedSet.has(f));

  if (declared.length === 0 && observed.length === 0) {
    return { result: 'no_changes', extra: [], missing: [] };
  }
  if (declared.length === 0 && observed.length > 0) {
    return { result: 'extra_files_detected', extra, missing: [], reason: `${extra.length} file(s) changed with no declared scope` };
  }
  if (extra.length === 0 && missing.length === 0) {
    return { result: 'exact_match', extra: [], missing: [] };
  }
  if (extra.length > 0) {
    return { result: 'extra_files_detected', extra, missing, reason: `extra: ${extra.join(', ')}` };
  }
  // missing > 0 but no extra: subset
  if (observed.length > 0) {
    return { result: 'subset_match', extra: [], missing };
  }
  return { result: 'missing_expected_changes', extra: [], missing, reason: `expected ${missing.join(', ')} but no files changed` };
}

export function makeShellStepExecutor(opts: ShellExecutorOptions): StepExecutor {
  const timeout = opts.timeout ?? 60_000;
  return {
    async executeStep({ step }) {
      const commandsRun: string[] = [];
      const commandOutputs: CommandOutput[] = [];
      const events: string[] = [];

      // Snapshot git state before step — for scope enforcement
      const pre = await gitChangedFiles(opts.cwd);

      for (const { command } of step.commands) {
        commandsRun.push(command);
        const t0 = Date.now();
        try {
          const { stdout, stderr } = await execFileAsync('sh', ['-c', command], { cwd: opts.cwd, timeout });
          const duration_ms = Date.now() - t0;
          commandOutputs.push({ command, exit_code: 0, stdout, stderr, duration_ms });
          events.push(`cmd_ok: ${command.slice(0, 120)}`);
        } catch (err: unknown) {
          const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
          const exitCode = e.code ?? 1;
          const stdout = e.stdout ?? '';
          const stderr = (e.stderr ?? String(e.message ?? '')).slice(0, 400);
          const duration_ms = Date.now() - t0;
          commandOutputs.push({ command, exit_code: exitCode, stdout, stderr, duration_ms });
          return {
            status: 'failed',
            files_changed: [],
            commands_run: commandsRun,
            command_outputs: commandOutputs,
            approvals: [],
            events,
            failure: {
              reason: `cmd_exit_${exitCode}`,
              summary: stderr || `exit code ${exitCode}`,
              recoverable: true,
            },
          };
        }
      }

      // Snapshot git state after step — compute delta
      const post = await gitChangedFiles(opts.cwd);

      if (!post.isGit) {
        return {
          status: 'completed',
          files_changed: step.expected_files.map((f) => f.path),
          commands_run: commandsRun,
          command_outputs: commandOutputs,
          approvals: [],
          events,
          failure: null,
          scope_result: 'non_git_unverifiable',
          files_declared: step.expected_files.map((f) => f.path),
          files_observed: [],
          scope_violation_reason: 'not a git repo — scope unverifiable',
        };
      }

      const preSet = new Set(pre.files);
      const observedDelta = post.files.filter((f) => !preSet.has(f));
      // Also include files that were changed (in post but were already in pre = tracked as modified)
      const observed = post.files;

      // Only check mutating declared files (not 'read' operations)
      const declaredMutating = step.expected_files
        .filter((f) => f.operation !== 'read')
        .map((f) => f.path);

      const { result: scopeResult, extra, missing, reason: scopeReason } = classifyScope(declaredMutating, observedDelta);

      const failed = scopeResult === 'extra_files_detected';

      if (failed) {
        events.push(`scope_violation: ${scopeReason}`);
        return {
          status: 'failed',
          files_changed: observed,
          commands_run: commandsRun,
          command_outputs: commandOutputs,
          approvals: [],
          events,
          failure: {
            reason: 'scope_violation',
            summary: scopeReason ?? 'extra files modified outside declared scope',
            recoverable: true,
          },
          scope_result: scopeResult,
          files_declared: declaredMutating,
          files_observed: observedDelta,
          incidental_files: extra,
          scope_violation_reason: scopeReason,
        };
      }

      return {
        status: 'completed',
        files_changed: observed.length > 0 ? observed : step.expected_files.map((f) => f.path),
        commands_run: commandsRun,
        command_outputs: commandOutputs,
        approvals: [],
        events,
        failure: null,
        scope_result: scopeResult,
        files_declared: declaredMutating,
        files_observed: observedDelta,
        ...(missing.length > 0 ? { scope_violation_reason: `expected but not changed: ${missing.join(', ')}` } : {}),
      };
    },
  };
}
