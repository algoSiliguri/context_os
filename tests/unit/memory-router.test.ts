import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMemoryRoute, scopeToDbPath } from '../../src/core/memory-router';

describe('memory-router', () => {
  it('buildMemoryRoute uses repoRoot for project DB and globalRoot for global DB', () => {
    const route = buildMemoryRoute({
      manifest: {
        memory_namespace: 'demo',
        global_memory_read: true,
        global_memory_write: false,
      },
      repoRoot: '/repo',
      globalRoot: '/global-brain',
    });
    expect(route.project_db_path).toBe(join('/repo', 'data_store', 'knowledge.db'));
    expect(route.global_db_path).toBe(join('/global-brain', 'knowledge.db'));
    expect(route.project_namespace).toBe('demo');
  });

  it('scopeToDbPath maps project → project_db_path and global → global_db_path', () => {
    const route = {
      project_namespace: 'demo',
      project_db_path: '/repo/data_store/knowledge.db',
      global_db_path: '/global-brain/knowledge.db',
      global_memory_read: true,
      global_memory_write: false,
    };
    expect(scopeToDbPath(route, 'project')).toBe(route.project_db_path);
    expect(scopeToDbPath(route, 'global')).toBe(route.global_db_path);
  });
});
