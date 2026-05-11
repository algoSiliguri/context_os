import { join } from 'node:path';

export type ArtifactType =
  | 'diagnosis'
  | 'evaluation'
  | 'execution'
  | 'grill'
  | 'knowledge'
  | 'plan'
  | 'quick-task'
  | 'review'
  | 'verification';

export function taskDir(repoRoot: string, taskId: string): string {
  return join(repoRoot, '.agent-os', 'tasks', taskId);
}

export function taskStatePath(repoRoot: string, taskId: string): string {
  return join(taskDir(repoRoot, taskId), 'state.json');
}

export function taskArtifactPath(repoRoot: string, taskId: string, type: ArtifactType): string {
  return join(taskDir(repoRoot, taskId), `${type}.yaml`);
}

export function taskRawDir(repoRoot: string, taskId: string): string {
  return join(taskDir(repoRoot, taskId), 'raw');
}

export function taskRawFile(repoRoot: string, taskId: string, hash: string): string {
  return join(taskRawDir(repoRoot, taskId), `${hash}.txt`);
}

export function taskPendingCapturesPath(repoRoot: string, taskId: string): string {
  return join(taskDir(repoRoot, taskId), 'pending-captures.yaml');
}
