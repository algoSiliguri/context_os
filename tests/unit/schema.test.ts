import { describe, expect, it } from 'vitest';
import { loadSchema, validate } from '../../src/core/schema';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, '..', '..', '.agent-os', 'schemas');

describe('schema', () => {
  it('loads constitution-binding.schema.json', () => {
    const schema = loadSchema(join(SCHEMA_DIR, 'constitution-binding.schema.json'));
    expect(schema).toHaveProperty('type', 'object');
  });

  it('validates a B0-like object', () => {
    const schema = loadSchema(join(SCHEMA_DIR, 'constitution-binding.schema.json'));
    const sample = {
      'system-id': 'agent-os',
      version: 'v2',
      'canonical-path': 'AGENT_OS_CONSTITUTION.md',
      'content-hash': 'a'.repeat(64),
      'schema-version': '1.0.0',
      'contract-index-hash': 'b'.repeat(64),
      'clause-count': 11,
      blocks: ['B0'],
      'binding-mode': 'header-first',
      'signature-required': false,
    };
    const result = validate(schema, sample);
    expect(result.valid).toBe(true);
  });

  it('returns errors for invalid object', () => {
    const schema = loadSchema(join(SCHEMA_DIR, 'constitution-binding.schema.json'));
    const result = validate(schema, { 'system-id': 'agent-os' }); // incomplete
    expect(result.valid).toBe(false);
    expect(result.errors).toBeTruthy();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});
