import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkflowPacks } from '../../src/core/workflow-pack-loader';
import type { WorkflowPackLoadResult } from '../../src/core/workflow-pack-loader';

const TMP = join(import.meta.dirname ?? __dirname, '../../node_modules/.test-tmp/pack-loader');

function makeRepoRoot(packDirs: { name: string; yaml: string }[]): string {
  const root = join(TMP, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const packsBase = join(root, '.agent-os', 'packs');
  mkdirSync(packsBase, { recursive: true });
  for (const { name, yaml } of packDirs) {
    const dir = join(packsBase, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'workflow-pack.yaml'), yaml, 'utf-8');
  }
  return root;
}

function assertOk(r: WorkflowPackLoadResult | undefined): asserts r is { ok: true; manifest: import('../../src/core/workflow-pack-loader').WorkflowPackManifest; packDir: string } {
  if (!r) throw new Error('result is undefined');
  if (!r.ok) throw new Error(`expected ok:true but got error: ${(r as { error: string }).error}`);
}

function assertFail(r: WorkflowPackLoadResult | undefined): asserts r is { ok: false; error: string; packDir: string } {
  if (!r) throw new Error('result is undefined');
  if (r.ok) throw new Error('expected ok:false but got ok:true');
}

const VALID_YAML = `
workflow_pack_id: test-pack
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
min_agent_os_version: "1.3.0"
phases:
  - id: grill
    agent_os_command: /grill
    allowed_predecessors: []
    produces: [GrillRecord]
    may_edit_source: false
    requires_approval: false
    validators: []
  - id: plan
    agent_os_command: /plan
    allowed_predecessors: [grill]
    produces: [PlanArtifact]
    may_edit_source: false
    requires_approval: true
    validators: [validate-artifact]
validators: []
`;

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

describe('loadWorkflowPacks', () => {
  it('returns [] when .agent-os/packs/ does not exist — backward compat', () => {
    const root = join(TMP, 'no-packs-repo');
    mkdirSync(join(root, '.agent-os'), { recursive: true });
    expect(loadWorkflowPacks(root)).toEqual([]);
  });

  it('returns [] when repo root itself does not exist', () => {
    expect(loadWorkflowPacks(join(TMP, 'nonexistent'))).toEqual([]);
  });

  it('loads a valid pack and returns ok:true with manifest', () => {
    const root = makeRepoRoot([{ name: 'test-pack', yaml: VALID_YAML }]);
    const results = loadWorkflowPacks(root);
    expect(results).toHaveLength(1);
    const r = results[0];
    assertOk(r);
    expect(r.manifest.workflow_pack_id).toBe('test-pack');
    expect(r.manifest.version).toBe('1.0.0');
    expect(r.manifest.phases).toHaveLength(2);
  });

  it('parses phases correctly including allowed_predecessors', () => {
    const root = makeRepoRoot([{ name: 'test-pack', yaml: VALID_YAML }]);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    assertOk(r);
    const planPhase = r.manifest.phases.find((p) => p.id === 'plan');
    expect(planPhase?.allowed_predecessors).toEqual(['grill']);
    expect(planPhase?.requires_approval).toBe(true);
  });

  it('returns ok:false with error when yaml is malformed', () => {
    const root = makeRepoRoot([{ name: 'bad-pack', yaml: ': invalid: yaml: [' }]);
    const results = loadWorkflowPacks(root);
    expect(results).toHaveLength(1);
    const r = results[0];
    assertFail(r);
    expect(r.error).toMatch(/bad-pack|Failed/i);
  });

  it('returns ok:false when required field workflow_pack_id is missing', () => {
    const missingId = VALID_YAML.replace('workflow_pack_id: test-pack\n', '');
    const root = makeRepoRoot([{ name: 'bad-pack', yaml: missingId }]);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    assertFail(r);
    expect(r.error).toMatch(/workflow_pack_id/);
  });

  it('returns ok:false when phases is empty', () => {
    const emptyPhases = `
workflow_pack_id: empty-phases-pack
version: "1.0.0"
schema_version: "1.0.0"
runtime_target: pi
phases: []
validators: []
`;
    const root = makeRepoRoot([{ name: 'bad-pack', yaml: emptyPhases }]);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    assertFail(r);
    expect(r.error).toMatch(/phases/);
  });

  it('returns ok:false when a pack directory has no workflow-pack.yaml', () => {
    const root = join(TMP, `repo-${Date.now()}`);
    const emptyPackDir = join(root, '.agent-os', 'packs', 'empty-pack');
    mkdirSync(emptyPackDir, { recursive: true });
    const results = loadWorkflowPacks(root);
    expect(results).toHaveLength(1);
    const r = results[0];
    assertFail(r);
    expect(r.error).toMatch(/not found/);
  });

  it('loads multiple packs and returns a result per pack', () => {
    const root = makeRepoRoot([
      { name: 'pack-a', yaml: VALID_YAML },
      { name: 'pack-b', yaml: VALID_YAML.replace('test-pack', 'pack-b') },
    ]);
    const results = loadWorkflowPacks(root);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('defaults artifact_format to yaml when not specified', () => {
    const root = makeRepoRoot([{ name: 'test-pack', yaml: VALID_YAML }]);
    const results = loadWorkflowPacks(root);
    const r = results[0];
    assertOk(r);
    expect(r.manifest.artifact_format).toBe('yaml');
  });
});
