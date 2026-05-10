import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/unit/ccp/brain/client.test.ts
import { describe, expect, it } from 'vitest';
import { BindingError } from '../../../../src/core/binding';
import { BrainClient, type BrainSpawnFn } from '../../../../src/ccp/brain/client';

describe('BrainClient', () => {
  it('write composes the brain CLI args from tagging convention', async () => {
    const calls: Array<{ args: string[] }> = [];
    const spawn: BrainSpawnFn = async (cmd, args) => {
      calls.push({ args });
      return {
        stdout: JSON.stringify({
          id: 'kn-1',
          content: '...',
          tags: [],
          created_at: 't',
          confidence: 0.85,
        }),
        stderr: '',
        exitCode: 0,
      };
    };
    const client = new BrainClient({ dbPath: '/path/to/brain.db', spawn });
    const node = await client.write({
      content: 'rate-limit middleware lives at src/middleware/',
      type: 'convention',
      scope: 'project',
      taskId: 'T-001',
      project: 'demo',
    });
    expect(node.id).toBe('kn-1');
    const args = calls[0]!.args;
    expect(args).toContain('--db-path');
    expect(args).toContain('/path/to/brain.db');
    expect(args).toContain('write');
    const writeIdx = args.indexOf('write');
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(args[writeIdx + 1]).toBe('rate-limit middleware lives at src/middleware/');
    expect(args.join(' ')).toContain('ccp:T-001');
    expect(args.join(' ')).toContain('type:convention');
    expect(args.join(' ')).toContain('scope:project');
    expect(args).toContain('--confidence');
    expect(args).toContain('0.85'); // 'convention' → 0.85
  });

  it('confidence scale per spec Section 10.3', () => {
    expect(BrainClient.confidenceFor('decision')).toBe(0.95);
    expect(BrainClient.confidenceFor('architecture')).toBe(0.95);
    expect(BrainClient.confidenceFor('warning')).toBe(0.9);
    expect(BrainClient.confidenceFor('command')).toBe(0.85);
    expect(BrainClient.confidenceFor('convention')).toBe(0.85);
    expect(BrainClient.confidenceFor('failure')).toBe(0.85);
    expect(BrainClient.confidenceFor('pattern')).toBe(0.7);
  });

  it('write throws BindingError when brain CLI is missing (ENOENT)', async () => {
    const spawn: BrainSpawnFn = async () => {
      throw Object.assign(new Error('ENOENT: brain not found'), { code: 'ENOENT' });
    };
    const client = new BrainClient({ dbPath: '/some/path', spawn });
    await expect(
      client.write({ content: 'note', type: 'convention', scope: 'project', taskId: 'T-001', project: 'demo' }),
    ).rejects.toMatchObject({ name: 'BindingError', condition: 'brain_cli_missing' });
  });

  it('write queues to pending-captures.yaml on transient (non-ENOENT) failure', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'aos-bc-'));
    mkdirSync(join(repoRoot, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    const spawn: BrainSpawnFn = async () => {
      throw Object.assign(new Error('spawn ETIMEDOUT'), { code: 'ETIMEDOUT' });
    };
    const client = new BrainClient({ dbPath: '/some/path', spawn, repoRoot });
    const result = await client.write({
      content: 'note',
      type: 'convention',
      scope: 'project',
      taskId: 'T-001',
      project: 'demo',
    });
    expect(result.id).toBe(null);
    expect(result.deferred).toBe(true);
    expect(existsSync(join(repoRoot, '.agent-os', 'tasks', 'T-001', 'pending-captures.yaml'))).toBe(true);
    const yaml = readFileSync(join(repoRoot, '.agent-os', 'tasks', 'T-001', 'pending-captures.yaml'), 'utf-8');
    expect(yaml).toContain('content: note');
  });

  it('query returns parsed result on success', async () => {
    const spawn: BrainSpawnFn = async () => ({
      stdout: JSON.stringify({
        query: 'rate',
        items: [{ id: 'kn-1', content: 'rate-limit pattern' }],
        total_matches: 1,
        returned_count: 1,
      }),
      stderr: '',
      exitCode: 0,
    });
    const client = new BrainClient({ dbPath: '/some/path', spawn });
    const r = await client.query({ query: 'rate', tags: ['type:command'] });
    expect(r.items).toHaveLength(1);
  });

  it('query returns empty result when brain unavailable (graceful)', async () => {
    const spawn: BrainSpawnFn = async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    const client = new BrainClient({ dbPath: '/x', spawn });
    const r = await client.query({ query: 'anything' });
    expect(r.items).toEqual([]);
    expect(r.total_matches).toBe(0);
  });

  it('probe() resolves when CLI returns compatible protocol version', async () => {
    const spawn: BrainSpawnFn = async () => ({ stdout: '1.0.0\n', stderr: '', exitCode: 0 });
    const client = new BrainClient({ spawn });
    await expect(client.probe()).resolves.toBeUndefined();
  });

  it('probe() throws BindingError when CLI is missing', async () => {
    const spawn: BrainSpawnFn = async () => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    };
    const client = new BrainClient({ spawn });
    await expect(client.probe()).rejects.toMatchObject({
      name: 'BindingError',
      condition: 'brain_cli_missing',
    });
  });

  it('probe() throws BindingError when CLI returns no protocol version (old CLI)', async () => {
    const spawn: BrainSpawnFn = async () => ({ stdout: '', stderr: '', exitCode: 0 });
    const client = new BrainClient({ spawn });
    await expect(client.probe()).rejects.toMatchObject({
      name: 'BindingError',
      condition: 'brain_protocol_incompatible',
    });
  });

  it('probe() throws BindingError when protocol version is below minimum', async () => {
    const spawn: BrainSpawnFn = async () => ({ stdout: '0.9.0\n', stderr: '', exitCode: 0 });
    const client = new BrainClient({ spawn });
    await expect(client.probe()).rejects.toMatchObject({
      name: 'BindingError',
      condition: 'brain_protocol_incompatible',
    });
  });
});
