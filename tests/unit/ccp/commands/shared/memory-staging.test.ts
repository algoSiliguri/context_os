import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approveCandidate,
  listCandidates,
  listPendingCandidates,
  rejectCandidate,
  stageCandidates,
} from '../../../../../src/ccp/commands/shared/memory-staging';

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aos-mem-'));
  mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
  return dir;
}

describe('memory staging', () => {
  it('stageCandidates writes to disk, returns candidates with pending status', () => {
    const dir = makeDir();
    const candidates = stageCandidates(dir, 'T-001', 's1', [
      { content: 'use TypeBox for schemas', type: 'convention', scope: 'project', evidence: 'e' },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.status).toBe('pending');
    expect(candidates[0]!.task_id).toBe('T-001');
    expect(candidates[0]!.session_id).toBe('s1');
    expect(candidates[0]!.content).toBe('use TypeBox for schemas');
  });

  it('listCandidates reads from disk after staging', () => {
    const dir = makeDir();
    stageCandidates(dir, 'T-001', 's1', [
      { content: 'candidate A', type: 'decision', scope: 'session', evidence: 'e1' },
      { content: 'candidate B', type: 'warning', scope: 'global', evidence: 'e2' },
    ]);
    const all = listCandidates(dir, 'T-001');
    expect(all).toHaveLength(2);
  });

  it('listPendingCandidates returns only pending', () => {
    const dir = makeDir();
    const [a, b] = stageCandidates(dir, 'T-001', 's1', [
      { content: 'a', type: 'decision', scope: 'session', evidence: 'e' },
      { content: 'b', type: 'decision', scope: 'session', evidence: 'e' },
    ]);
    approveCandidate(dir, 'T-001', a!.id);
    const pending = listPendingCandidates(dir, 'T-001');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(b!.id);
  });

  it('approveCandidate updates status and decided_at, does not write to brain', () => {
    const dir = makeDir();
    const [c] = stageCandidates(dir, 'T-001', 's1', [
      { content: 'x', type: 'architecture', scope: 'project', evidence: 'e' },
    ]);
    approveCandidate(dir, 'T-001', c!.id, 'brain-node-42');
    const all = listCandidates(dir, 'T-001');
    expect(all[0]!.status).toBe('approved');
    expect(all[0]!.brain_node_id).toBe('brain-node-42');
    expect(all[0]!.decided_at).toBeTruthy();
  });

  it('rejectCandidate leaves brain unchanged, marks rejected', () => {
    const dir = makeDir();
    const [c] = stageCandidates(dir, 'T-001', 's1', [
      { content: 'y', type: 'failure', scope: 'session', evidence: 'e' },
    ]);
    rejectCandidate(dir, 'T-001', c!.id);
    const all = listCandidates(dir, 'T-001');
    expect(all[0]!.status).toBe('rejected');
    expect(all[0]!.brain_node_id).toBeUndefined();
  });

  it('approveCandidate throws for unknown id', () => {
    const dir = makeDir();
    expect(() => approveCandidate(dir, 'T-001', 'MC-nonexistent')).toThrow('not found');
  });

  it('rejectCandidate throws for unknown id', () => {
    const dir = makeDir();
    expect(() => rejectCandidate(dir, 'T-001', 'MC-nonexistent')).toThrow('not found');
  });

  it('listCandidates returns empty array when no staging file exists', () => {
    const dir = makeDir();
    expect(listCandidates(dir, 'T-001')).toEqual([]);
  });

  it('stageCandidates appends to existing staged candidates', () => {
    const dir = makeDir();
    stageCandidates(dir, 'T-001', 's1', [
      { content: 'first', type: 'decision', scope: 'session', evidence: 'e' },
    ]);
    stageCandidates(dir, 'T-001', 's1', [
      { content: 'second', type: 'warning', scope: 'project', evidence: 'e' },
    ]);
    expect(listCandidates(dir, 'T-001')).toHaveLength(2);
  });

  it('pending candidates survive after simulated session restart (reload)', () => {
    const dir = makeDir();
    stageCandidates(dir, 'T-001', 's1', [
      { content: 'orphan candidate', type: 'pattern', scope: 'project', evidence: 'e' },
    ]);
    // Simulate restart: re-read from disk
    const loaded = listPendingCandidates(dir, 'T-001');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.content).toBe('orphan candidate');
    expect(loaded[0]!.status).toBe('pending');
  });

  it('approveCandidate is idempotent if called with same brain_node_id', () => {
    const dir = makeDir();
    const [c] = stageCandidates(dir, 'T-001', 's1', [
      { content: 'x', type: 'convention', scope: 'project', evidence: 'e' },
    ]);
    approveCandidate(dir, 'T-001', c!.id, 'brain-1');
    // Calling approve again on already-approved should not throw
    expect(() => approveCandidate(dir, 'T-001', c!.id, 'brain-1')).not.toThrow();
    const all = listCandidates(dir, 'T-001');
    expect(all[0]!.status).toBe('approved');
    expect(all[0]!.brain_node_id).toBe('brain-1');
  });

  it('rejectCandidate on already-approved does not change brain_node_id', () => {
    const dir = makeDir();
    const [c] = stageCandidates(dir, 'T-001', 's1', [
      { content: 'y', type: 'architecture', scope: 'global', evidence: 'e' },
    ]);
    approveCandidate(dir, 'T-001', c!.id, 'brain-2');
    // Rejecting after approval is allowed — status changes but brain_node_id preserved
    rejectCandidate(dir, 'T-001', c!.id);
    const all = listCandidates(dir, 'T-001');
    expect(all[0]!.status).toBe('rejected');
    // brain_node_id should still be there (persisted from approval)
    expect(all[0]!.brain_node_id).toBe('brain-2');
  });
});
