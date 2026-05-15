import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installBundledPacks } from '../../src/ccp/commands/init/pack-installer';

const VALID_PACK_YAML = `\
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
validators: []
`;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'aos-pack-'));
});

afterEach(() => {
  // tmpdir cleanup is OS-managed; no force-rm to keep test isolation safe
});

function makeSource(packs: { name: string; yaml?: string }[]): string {
  const src = join(tmpRoot, 'src-packs');
  for (const { name, yaml = VALID_PACK_YAML } of packs) {
    const packDir = join(src, name);
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'workflow-pack.yaml'), yaml);
  }
  return src;
}

function makeTarget(): string {
  const t = join(tmpRoot, 'target');
  mkdirSync(t, { recursive: true });
  return t;
}

describe('installBundledPacks', () => {
  it('returns [] when sourceRoot does not exist', () => {
    const results = installBundledPacks({
      sourceRoot: join(tmpRoot, 'nonexistent'),
      targetRoot: makeTarget(),
    });
    expect(results).toEqual([]);
  });

  it('installs pack into .agent-os/packs/<packId>/', () => {
    const src = makeSource([{ name: 'copilot-workflow' }]);
    const target = makeTarget();
    const results = installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ packId: 'copilot-workflow', status: 'installed' });
    expect(existsSync(join(target, '.agent-os', 'packs', 'copilot-workflow', 'workflow-pack.yaml'))).toBe(true);
  });

  it('pack yaml content is preserved after install', () => {
    const src = makeSource([{ name: 'copilot-workflow' }]);
    const target = makeTarget();
    installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });

    const written = readFileSync(
      join(target, '.agent-os', 'packs', 'copilot-workflow', 'workflow-pack.yaml'),
      'utf-8',
    );
    expect(written).toContain('workflow_pack_id: test-pack');
  });

  it('skips pack when workflow-pack.yaml already exists (idempotent)', () => {
    const src = makeSource([{ name: 'copilot-workflow' }]);
    const target = makeTarget();

    // First install
    installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });

    // User modifies the pack
    const packManifestPath = join(target, '.agent-os', 'packs', 'copilot-workflow', 'workflow-pack.yaml');
    writeFileSync(packManifestPath, 'user-modified: true\n');

    // Second install — should skip
    const results = installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });
    expect(results[0]).toMatchObject({ packId: 'copilot-workflow', status: 'skipped' });

    // User modification preserved
    expect(readFileSync(packManifestPath, 'utf-8')).toContain('user-modified: true');
  });

  it('overwrites existing pack when force=true', () => {
    const src = makeSource([{ name: 'copilot-workflow' }]);
    const target = makeTarget();

    installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });

    // User modifies the pack
    const packManifestPath = join(target, '.agent-os', 'packs', 'copilot-workflow', 'workflow-pack.yaml');
    writeFileSync(packManifestPath, 'user-modified: true\n');

    // Force reinstall
    const results = installBundledPacks({ sourceRoot: src, targetRoot: target, force: true, packId: 'copilot-workflow' });
    expect(results[0]).toMatchObject({ packId: 'copilot-workflow', status: 'installed' });
    expect(readFileSync(packManifestPath, 'utf-8')).toContain('workflow_pack_id: test-pack');
  });

  it('installs multiple packs when called with each packId in turn', () => {
    const src = makeSource([
      { name: 'pack-a' },
      { name: 'pack-b', yaml: VALID_PACK_YAML.replace('test-pack', 'pack-b') },
    ]);
    const target = makeTarget();
    const resultA = installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'pack-a' });
    const resultB = installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'pack-b' });

    expect(resultA).toHaveLength(1);
    expect(resultA[0]).toMatchObject({ packId: 'pack-a', status: 'installed' });
    expect(resultB).toHaveLength(1);
    expect(resultB[0]).toMatchObject({ packId: 'pack-b', status: 'installed' });
    expect(existsSync(join(target, '.agent-os', 'packs', 'pack-a', 'workflow-pack.yaml'))).toBe(true);
    expect(existsSync(join(target, '.agent-os', 'packs', 'pack-b', 'workflow-pack.yaml'))).toBe(true);
  });

  it('creates .agent-os/packs/ dir if it does not exist', () => {
    const src = makeSource([{ name: 'copilot-workflow' }]);
    const target = makeTarget();
    expect(existsSync(join(target, '.agent-os', 'packs'))).toBe(false);

    installBundledPacks({ sourceRoot: src, targetRoot: target, packId: 'copilot-workflow' });

    expect(existsSync(join(target, '.agent-os', 'packs'))).toBe(true);
  });
});
