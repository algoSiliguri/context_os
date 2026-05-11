// src/ccp/tools/pi-agent-executor.ts
import { decideToolCall, type DecisionContext } from '../policy/decision-flow';
import type { StepExecutor, StepExecutionResult } from '../commands/shared/step-executor';

export interface PiAgentLike {
  runAgent(prompt: string): Promise<{
    filesChanged: string[];
    commandsRun: string[];
    exitCode: number;
    errorSummary?: string;
  }>;
}

export interface PolicyContext {
  decisionCtx: DecisionContext;
  /** Called when a command needs per-invocation approval (tier 2/3). If absent, ask → block. */
  askForApproval?: (command: string, reason: string) => Promise<boolean>;
}

const POLICY_BLOCKED: StepExecutionResult = {
  status: 'failed',
  files_changed: [],
  commands_run: [],
  command_outputs: [],
  approvals: [],
  events: [],
  failure: { reason: 'policy_blocked', summary: '', recoverable: false },
};

function blockedResult(summary: string): StepExecutionResult {
  return { ...POLICY_BLOCKED, failure: { reason: 'policy_blocked', summary, recoverable: false } };
}

export function makePiAgentExecutor(opts: {
  agent: PiAgentLike;
  policy?: PolicyContext;
}): StepExecutor {
  return {
    async executeStep({ stepId, step }) {
      if (opts.policy) {
        for (const cmd of step.commands) {
          const decision = decideToolCall(
            { toolName: 'run_command', input: { command: cmd.command } },
            opts.policy.decisionCtx,
          );
          if (decision.outcome === 'block') {
            return blockedResult(`command "${cmd.command}" blocked by policy: ${decision.reason}`);
          }
          if (decision.outcome === 'ask') {
            const approved = opts.policy.askForApproval
              ? await opts.policy.askForApproval(cmd.command, decision.reason)
              : false;
            if (!approved) {
              return blockedResult(
                `command "${cmd.command}" requires approval: ${decision.reason}`,
              );
            }
          }
        }
      }

      const prompt = renderStepPrompt(stepId, step);
      const result = await opts.agent.runAgent(prompt);
      if (result.exitCode === 0) {
        return {
          status: 'completed',
          files_changed: result.filesChanged,
          commands_run: result.commandsRun,
          command_outputs: [],
          approvals: [],
          events: [],
          failure: null,
        };
      }
      const summary = result.errorSummary ?? `exit code ${result.exitCode}`;
      return {
        status: 'failed',
        files_changed: result.filesChanged,
        commands_run: result.commandsRun,
        command_outputs: [],
        approvals: [],
        events: [],
        failure: { reason: 'agent_nonzero_exit', summary, recoverable: true },
      };
    },
  };
}

function renderStepPrompt(
  stepId: string,
  step: {
    commands: Array<{ command: string; approval_tier: number }>;
    expected_files: Array<{ path: string; operation: string }>;
  },
): string {
  const cmds = step.commands.map((c) => `- ${c.command} (tier ${c.approval_tier})`).join('\n');
  const files = step.expected_files.map((f) => `- ${f.operation} ${f.path}`).join('\n');
  return [
    `Execute step ${stepId}.`,
    'Expected files to touch:',
    files || '  (none specified)',
    'Commands to run:',
    cmds || '  (none specified)',
    'When done, report files actually changed and any non-zero exit.',
  ].join('\n');
}
