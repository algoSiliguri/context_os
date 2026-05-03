import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindProject } from '../../src/core/binding';
import { computeConstitutionHash, computeJsonFileHash } from '../../src/core/hash';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('binding', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aos-bind-'));
    mkdirSync(join(repoRoot, '.agent-os', 'schemas'), { recursive: true });
    mkdirSync(join(repoRoot, '.agent-os', 'contracts'), { recursive: true });
    mkdirSync(join(repoRoot, '.agent-os', 'runtime'), { recursive: true });
    const projectSchemas = join(__dirname, '..', '..', '.agent-os', 'schemas');
    for (const f of [
      'constitution-binding.schema.json',
      'telemetry-event.schema.json',
      'permission-manifest.schema.json',
    ]) {
      copyFileSync(join(projectSchemas, f), join(repoRoot, '.agent-os', 'schemas', f));
    }
    const contractIndex = '{}';
    writeFileSync(join(repoRoot, '.agent-os', 'contracts', 'index.json'), contractIndex);
    let body = readFileSync(join(__dirname, '..', 'fixtures', 'constitution-good.md'), 'utf-8');
    const indexHash = computeJsonFileHash(contractIndex);
    body = body.replace('contract-index-hash: ""', `contract-index-hash: "${indexHash}"`);
    const contentHash = computeConstitutionHash(body);
    body = body.replace('content-hash: ""', `content-hash: "${contentHash}"`);
    writeFileSync(join(repoRoot, 'AGENT_OS_CONSTITUTION.md'), body);

    const projectYaml = `
project_id: demo
domain_type: trading
runtime_version: 0.1.0
memory_namespace: demo
verification_profile: default
critical_actions: []
workspace:
  root: .
`;
    writeFileSync(join(repoRoot, '.agent-os', 'project.yaml'), projectYaml);
  });

  it('bindProject returns a SessionBindingRecord on success', async () => {
    const record = await bindProject(repoRoot, { skipBundleVerification: true });
    expect(record.project_id).toBe('demo');
    expect(record.runtime_version).toBe('0.1.0');
    expect(record.state).toBe('BOUND');
    expect(record.session_id).toMatch(/^sess-/);
  });
});
