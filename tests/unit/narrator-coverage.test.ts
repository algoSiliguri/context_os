import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXTENSION_PATH = join(import.meta.dirname ?? __dirname, '../../src/pi/extension.ts');

describe('narrator coverage in extension.ts', () => {
  const source = readFileSync(EXTENSION_PATH, 'utf-8');

  const REQUIRED_TAGS = [
    'pack', 'phase', 'doc', 'validator', 'step',
    'memory', 'plan', 'verify', 'review', 'evaluate',
    'doctor',
  ];

  for (const tag of REQUIRED_TAGS) {
    it(`emits at least one narrate('${tag}', ...) call`, () => {
      const pattern = new RegExp(`narrate\\(\\s*['"]${tag}['"]`);
      expect(pattern.test(source), `[${tag}] tag must be wired into extension.ts`).toBe(true);
    });
  }
});
