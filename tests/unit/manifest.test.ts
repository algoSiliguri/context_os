import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectConfig, ProjectConfig } from '../../src/core/manifest';
import { Value } from '@sinclair/typebox/value';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'fixtures', 'project.yaml');

describe('manifest', () => {
  it('loads and validates the fixture', () => {
    const config = loadProjectConfig(FIXTURE);
    expect(config.project_id).toBe('demo');
    expect(config.workspace.root).toBe('.');
    expect(config.allowlist?.commands).toContain('npm test');
    expect(config.trust_registry?.pi_packages?.[0]?.trust).toBe('trusted');
  });

  it('schema validation rejects missing project_id', () => {
    const bad = { runtime_version: '0.1.0', workspace: { root: '.' } };
    expect(Value.Check(ProjectConfig, bad)).toBe(false);
  });

  it('throws on missing file', () => {
    expect(() => loadProjectConfig('/nonexistent.yaml')).toThrow();
  });
});
