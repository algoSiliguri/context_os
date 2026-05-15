import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PI_DIR = join(import.meta.dirname ?? __dirname, '../../src/pi');

function readAllTs(dir: string): string {
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out += readAllTs(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out += readFileSync(full, 'utf-8');
    }
  }
  return out;
}

describe('narrator coverage in src/pi/', () => {
  const source = readAllTs(PI_DIR);

  const REQUIRED_TAGS = [
    'pack', 'phase', 'doc', 'validator', 'step',
    'memory', 'plan', 'verify', 'review', 'evaluate',
    'doctor',
  ];

  for (const tag of REQUIRED_TAGS) {
    it(`emits at least one narrate('${tag}', ...) call`, () => {
      const pattern = new RegExp(`narrate\\(\\s*['"]${tag}['"]`);
      expect(pattern.test(source), `[${tag}] tag must be wired into src/pi/`).toBe(true);
    });
  }
});
