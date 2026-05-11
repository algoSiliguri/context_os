import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import YAML from 'yaml';
import type { MemoryCandidate } from '../../artifacts/memory-candidate';
import { MemoryCandidate as MemoryCandidateSchema } from '../../artifacts/memory-candidate';
import { taskMemoryCandidatesPath } from '../../task-paths';

function readCandidates(repoRoot: string, taskId: string): MemoryCandidate[] {
  const path = taskMemoryCandidatesPath(repoRoot, taskId);
  if (!existsSync(path)) return [];
  try {
    const parsed = YAML.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => Value.Check(MemoryCandidateSchema, c)) as MemoryCandidate[];
  } catch {
    return [];
  }
}

function writeCandidates(repoRoot: string, taskId: string, candidates: MemoryCandidate[]): void {
  const path = taskMemoryCandidatesPath(repoRoot, taskId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, YAML.stringify(candidates, { indent: 2 }), 'utf-8');
  renameSync(tmp, path);
}

export interface StagedCandidate {
  content: string;
  type: MemoryCandidate['type'];
  scope: MemoryCandidate['scope'];
  evidence: string;
}

export function stageCandidates(
  repoRoot: string,
  taskId: string,
  sessionId: string,
  proposals: StagedCandidate[],
): MemoryCandidate[] {
  const now = new Date().toISOString();
  const existing = readCandidates(repoRoot, taskId);
  const fresh: MemoryCandidate[] = proposals.map((p, i) => ({
    id: `MC-${Date.now()}-${i}`,
    task_id: taskId,
    session_id: sessionId,
    content: p.content,
    type: p.type,
    scope: p.scope,
    evidence: p.evidence,
    status: 'pending',
    staged_at: now,
  }));
  writeCandidates(repoRoot, taskId, [...existing, ...fresh]);
  return fresh;
}

export function listCandidates(repoRoot: string, taskId: string): MemoryCandidate[] {
  return readCandidates(repoRoot, taskId);
}

export function listPendingCandidates(repoRoot: string, taskId: string): MemoryCandidate[] {
  return readCandidates(repoRoot, taskId).filter((c) => c.status === 'pending');
}

export function approveCandidate(
  repoRoot: string,
  taskId: string,
  id: string,
  brainNodeId?: string,
): void {
  const candidates = readCandidates(repoRoot, taskId);
  const idx = candidates.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`memory candidate not found: ${id}`);
  candidates[idx] = {
    ...candidates[idx]!,
    status: 'approved',
    decided_at: new Date().toISOString(),
    ...(brainNodeId ? { brain_node_id: brainNodeId } : {}),
  };
  writeCandidates(repoRoot, taskId, candidates);
}

export function rejectCandidate(repoRoot: string, taskId: string, id: string): void {
  const candidates = readCandidates(repoRoot, taskId);
  const idx = candidates.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`memory candidate not found: ${id}`);
  candidates[idx] = {
    ...candidates[idx]!,
    status: 'rejected',
    decided_at: new Date().toISOString(),
  };
  writeCandidates(repoRoot, taskId, candidates);
}
