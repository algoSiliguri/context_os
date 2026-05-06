import { describe, expect, it, vi } from 'vitest';
import { ensureBrainCli } from '../../../../../src/ccp/commands/init/brain-installer';

describe('ensureBrainCli', () => {
  it('returns "already-installed" when `brain --version` succeeds', () => {
    const exec = vi.fn((cmd: string) => {
      if (cmd.includes('brain --version')) return '0.0.0';
      throw new Error('unexpected exec');
    });
    expect(ensureBrainCli({ exec })).toEqual({ status: 'already-installed' });
  });

  it('runs `uv tool install` when brain is missing and uv is present', () => {
    const calls: string[] = [];
    const exec = vi.fn((cmd: string) => {
      calls.push(cmd);
      if (cmd.includes('brain --version')) throw new Error('not found');
      if (cmd.includes('uv --version')) return 'uv 0.7.0';
      if (cmd.includes('uv tool install')) return 'Installed knowledge-brain';
      throw new Error(`unexpected: ${cmd}`);
    });
    expect(ensureBrainCli({ exec })).toEqual({ status: 'installed' });
    expect(calls.some((c) => c.includes('uv tool install'))).toBe(true);
  });

  it('throws a helpful error when uv is missing', () => {
    const exec = vi.fn((cmd: string) => {
      if (cmd.includes('brain --version')) throw new Error('not found');
      if (cmd.includes('uv --version')) throw new Error('not found');
      throw new Error(`unexpected: ${cmd}`);
    });
    expect(() => ensureBrainCli({ exec })).toThrow(/uv is not installed/);
  });
});
