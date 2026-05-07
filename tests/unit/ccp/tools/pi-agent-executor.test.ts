// tests/unit/ccp/tools/pi-agent-executor.test.ts
import { describe, expect, it } from 'vitest';
import { type PiAgentLike, makePiAgentExecutor } from '../../../../src/ccp/tools/pi-agent-executor';
import { ToolRegistry } from '../../../../src/ccp/policy/tool-registry';
import { seedPiTools } from '../../../../src/ccp/tools/pi-tool-defaults';
import type { DecisionContext } from '../../../../src/ccp/policy/decision-flow';
import type { ProjectConfig } from '../../../../src/core/manifest';

const noopAgent: PiAgentLike = {
  async runAgent(_prompt) {
    return { filesChanged: [], commandsRun: [], exitCode: 0 };
  },
};

function makeCtx(overrides?: ProjectConfig['overrides']): DecisionContext {
  const registry = new ToolRegistry();
  seedPiTools(registry);
  const config: ProjectConfig = {
    project_id: 'test',
    domain_type: 'test',
    runtime_version: '0.1.0',
    memory_namespace: 'test',
    verification_profile: 'default',
    workspace: { root: '/repo' },
    overrides,
  };
  return { registry, cache: new Map(), config };
}

describe('makePiAgentExecutor', () => {
  it('returns completed when the agent exits 0 (no policy)', async () => {
    const exec = makePiAgentExecutor({ agent: noopAgent });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [{ command: 'do something', approval_tier: 2 }], expected_files: [] },
    });
    expect(r.status).toBe('completed');
  });

  it('returns failed (recoverable) when the agent reports non-zero exit', async () => {
    const failingAgent: PiAgentLike = {
      async runAgent() {
        return { filesChanged: [], commandsRun: [], exitCode: 1, errorSummary: 'tests failed' };
      },
    };
    const exec = makePiAgentExecutor({ agent: failingAgent });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [], expected_files: [] },
    });
    expect(r.status).toBe('failed');
    expect(r.failure?.recoverable).toBe(true);
    expect(r.failure?.summary).toContain('tests failed');
  });

  it('passes commands and expected files into the prompt', async () => {
    const captured: string[] = [];
    const probeAgent: PiAgentLike = {
      async runAgent(prompt) {
        captured.push(prompt);
        return { filesChanged: [], commandsRun: [], exitCode: 0 };
      },
    };
    const exec = makePiAgentExecutor({ agent: probeAgent });
    await exec.executeStep({
      stepId: 'S-1',
      step: {
        commands: [{ command: 'npm install', approval_tier: 3 }],
        expected_files: [{ path: 'src/foo.ts', operation: 'create' }],
      },
    });
    expect(captured[0]).toContain('npm install');
    expect(captured[0]).toContain('src/foo.ts');
  });

  it('blocks a tier-4 command and does not call runAgent', async () => {
    const called: string[] = [];
    const agent: PiAgentLike = {
      async runAgent(prompt) {
        called.push(prompt);
        return { filesChanged: [], commandsRun: [], exitCode: 0 };
      },
    };
    const exec = makePiAgentExecutor({ agent, policy: { decisionCtx: makeCtx() } });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [{ command: 'sudo rm -rf /', approval_tier: 4 }], expected_files: [] },
    });
    expect(r.status).toBe('failed');
    expect(r.failure?.reason).toBe('policy_blocked');
    expect(called).toHaveLength(0);
  });

  it('blocks an ask-outcome command when askForApproval is absent', async () => {
    const called: string[] = [];
    const agent: PiAgentLike = {
      async runAgent(prompt) {
        called.push(prompt);
        return { filesChanged: [], commandsRun: [], exitCode: 0 };
      },
    };
    // run_command is tier-2 by default → asks once-per-session, cache empty → 'ask'
    const exec = makePiAgentExecutor({ agent, policy: { decisionCtx: makeCtx() } });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [{ command: 'npm test', approval_tier: 2 }], expected_files: [] },
    });
    expect(r.status).toBe('failed');
    expect(r.failure?.reason).toBe('policy_blocked');
    expect(called).toHaveLength(0);
  });

  it('proceeds when askForApproval returns true', async () => {
    const exec = makePiAgentExecutor({
      agent: noopAgent,
      policy: {
        decisionCtx: makeCtx(),
        askForApproval: async () => true,
      },
    });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [{ command: 'npm test', approval_tier: 2 }], expected_files: [] },
    });
    expect(r.status).toBe('completed');
  });

  it('blocks when askForApproval returns false', async () => {
    const called: string[] = [];
    const agent: PiAgentLike = {
      async runAgent(prompt) {
        called.push(prompt);
        return { filesChanged: [], commandsRun: [], exitCode: 0 };
      },
    };
    const exec = makePiAgentExecutor({
      agent,
      policy: {
        decisionCtx: makeCtx(),
        askForApproval: async () => false,
      },
    });
    const r = await exec.executeStep({
      stepId: 'S-1',
      step: { commands: [{ command: 'npm test', approval_tier: 2 }], expected_files: [] },
    });
    expect(r.status).toBe('failed');
    expect(called).toHaveLength(0);
  });
});
