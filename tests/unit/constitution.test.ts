import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyConstitution } from '../../src/core/constitution';
import { computeConstitutionHash, computeJsonFileHash } from '../../src/core/hash';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('constitution', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aos-cn-'));
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
  });

  it('verifyConstitution passes for a well-formed fixture', () => {
    const result = verifyConstitution(repoRoot);
    expect(result.hardFailed).toBeNull();
    expect(result.passed).toContain('C4');
    expect(result.passed).toContain('C8');
  });

  it('hard-fails C4 if content-hash is wrong', () => {
    const path = join(repoRoot, 'AGENT_OS_CONSTITUTION.md');
    const original = readFileSync(path, 'utf-8');
    writeFileSync(path, original.replace('Body content for hashing.', 'Body content TAMPERED.'));
    const result = verifyConstitution(repoRoot);
    expect(result.hardFailed).toBe('C4');
    writeFileSync(path, original);
  });
});
