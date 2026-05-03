import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  ProjectManifest,
  SessionBindingRecord,
  validateProjectManifest,
} from '../../src/core/models';

describe('ProjectManifest', () => {
  const valid = {
    project_id: 'demo',
    domain_type: 'trading',
    runtime_version: '0.1.0',
    memory_namespace: 'demo-project',
    verification_profile: 'default',
    project_constitution: null,
    global_memory_read: true,
    global_memory_write: false,
    critical_actions: ['memory_write_global'],
  };

  it('accepts a valid manifest', () => {
    expect(Value.Check(ProjectManifest, valid)).toBe(true);
  });

  it('rejects manifest with blank critical action', () => {
    const bad = { ...valid, critical_actions: ['valid', '   '] };
    expect(() => validateProjectManifest(bad)).toThrow(/critical actions must not contain blanks/);
  });

  it('applies defaults: global_memory_read=true, global_memory_write=false, critical_actions=[]', () => {
    const minimal = {
      project_id: 'demo',
      domain_type: 'trading',
      runtime_version: '0.1.0',
      memory_namespace: 'demo-project',
      verification_profile: 'default',
    };
    const parsed = validateProjectManifest(minimal);
    expect(parsed.global_memory_read).toBe(true);
    expect(parsed.global_memory_write).toBe(false);
    expect(parsed.critical_actions).toEqual([]);
  });
});

describe('SessionBindingRecord', () => {
  it('accepts a valid record', () => {
    const valid = {
      session_id: 'sess-abc',
      project_id: 'demo',
      runtime_version: '0.1.0',
      repo_root: '/tmp/repo',
      runtime_dir: '/tmp/repo/.agent-os/runtime',
      memory_namespace: 'demo',
      state: 'BOUND',
      effective_critical_actions: [],
      bound_at: '2026-05-03T14:00:00Z',
      verification_passed: ['C4'],
      verification_soft_failed: [],
      binding_degraded: false,
    };
    expect(Value.Check(SessionBindingRecord, valid)).toBe(true);
  });
});
