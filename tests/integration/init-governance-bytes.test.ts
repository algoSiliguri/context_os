import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

const FILES = [
  { bundle: 'AGENT_OS_CONSTITUTION.md', fixture: 'AGENT_OS_CONSTITUTION.md' },
  { bundle: '.agent-os/schemas/constitution-binding.schema.json', fixture: '.agent-os/schemas/constitution-binding.schema.json' },
  { bundle: '.agent-os/schemas/telemetry-event.schema.json', fixture: '.agent-os/schemas/telemetry-event.schema.json' },
  { bundle: '.agent-os/schemas/permission-manifest.schema.json', fixture: '.agent-os/schemas/permission-manifest.schema.json' },
  { bundle: '.agent-os/contracts/index.json', fixture: '.agent-os/contracts/index.json' },
];

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('governance-bytes invariant (v1.0.0 ↔ v1.1.0)', () => {
  it.each(FILES)('$bundle is byte-identical to v1.0.0 fixture', ({ bundle, fixture }) => {
    const bundled = readFileSync(join(REPO_ROOT, bundle));
    const expected = readFileSync(join(REPO_ROOT, 'tests', 'fixtures', 'v1.0.0', fixture));
    expect(sha256(bundled)).toBe(sha256(expected));
  });
});
