import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOVERNANCE_FILES, copyGovernance } from '../../../../../src/ccp/commands/init/governance';

describe('copyGovernance', () => {
  it('copies all governance files byte-exact and creates parent dirs', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'aos-src-'));
    mkdirSync(join(sourceRoot, '.agent-os', 'schemas'), { recursive: true });
    mkdirSync(join(sourceRoot, '.agent-os', 'contracts'), { recursive: true });
    for (const f of GOVERNANCE_FILES) {
      writeFileSync(join(sourceRoot, f), `content of ${f}`);
    }
    const targetRoot = mkdtempSync(join(tmpdir(), 'aos-tgt-'));

    copyGovernance({ sourceRoot, targetRoot });

    for (const f of GOVERNANCE_FILES) {
      expect(readFileSync(join(targetRoot, f), 'utf8')).toBe(`content of ${f}`);
    }
  });

  it('does not leave .tmp files behind on success', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'aos-src-'));
    mkdirSync(join(sourceRoot, '.agent-os', 'schemas'), { recursive: true });
    mkdirSync(join(sourceRoot, '.agent-os', 'contracts'), { recursive: true });
    for (const f of GOVERNANCE_FILES) writeFileSync(join(sourceRoot, f), 'x');
    const targetRoot = mkdtempSync(join(tmpdir(), 'aos-tgt-'));

    copyGovernance({ sourceRoot, targetRoot });

    for (const sub of ['', '.agent-os', '.agent-os/schemas', '.agent-os/contracts']) {
      const entries = readdirSync(join(targetRoot, sub));
      expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
    }
  });

  it('throws if a source file is missing', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'aos-src-'));
    const targetRoot = mkdtempSync(join(tmpdir(), 'aos-tgt-'));
    expect(() => copyGovernance({ sourceRoot, targetRoot })).toThrow(/AGENT_OS_CONSTITUTION/);
  });
});
