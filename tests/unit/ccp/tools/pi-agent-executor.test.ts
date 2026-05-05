// tests/unit/ccp/tools/pi-agent-executor.test.ts
import { describe, expect, it } from 'vitest';
import { type PiAgentLike, makePiAgentExecutor } from '../../../../src/ccp/tools/pi-agent-executor';

const noopAgent: PiAgentLike = {
  async runAgent(_prompt) {
    return { filesChanged: [], commandsRun: [], exitCode: 0 };
  },
};

describe('makePiAgentExecutor', () => {
  it('returns completed when the agent exits 0', async () => {
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
});
