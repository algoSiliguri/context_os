import { join } from 'node:path';

export type Scope = 'project' | 'global';

export interface MemoryRoute {
  project_namespace: string;
  project_db_path: string;
  global_db_path: string;
  global_memory_read: boolean;
  global_memory_write: boolean;
}

export interface MemoryManifestSubset {
  memory_namespace: string;
  global_memory_read?: boolean;
  global_memory_write?: boolean;
}

export function buildMemoryRoute(args: {
  manifest: MemoryManifestSubset;
  repoRoot: string;
  globalRoot: string;
}): MemoryRoute {
  return {
    project_namespace: args.manifest.memory_namespace,
    project_db_path: join(args.repoRoot, 'data_store', 'knowledge.db'),
    global_db_path: join(args.globalRoot, 'knowledge.db'),
    global_memory_read: args.manifest.global_memory_read ?? true,
    global_memory_write: args.manifest.global_memory_write ?? false,
  };
}

export function scopeToDbPath(route: MemoryRoute, scope: Scope): string {
  return scope === 'global' ? route.global_db_path : route.project_db_path;
}
