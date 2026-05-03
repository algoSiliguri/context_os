import { describe, expect, it } from 'vitest';
import { computeConstitutionHash, normalizeConstitutionForHash } from '../../src/core/hash';

const SAMPLE = `---
title: AGENT_OS_CONSTITUTION
status: canonical
---

## [B0] Binding Header

\`\`\`yaml
system-id: agent-os
content-hash: "abc123def456"
schema-version: "1.0.0"
\`\`\`

Other content here.`;

describe('hash', () => {
  it('normalizeConstitutionForHash replaces content-hash value with ""', () => {
    const normalized = normalizeConstitutionForHash(SAMPLE);
    expect(normalized).toContain('content-hash: ""');
    expect(normalized).not.toContain('abc123def456');
  });

  it('computeConstitutionHash is deterministic for identical input', () => {
    const h1 = computeConstitutionHash(SAMPLE);
    const h2 = computeConstitutionHash(SAMPLE);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when content (other than content-hash field) changes', () => {
    const altered = SAMPLE.replace('Other content here.', 'Different content.');
    expect(computeConstitutionHash(SAMPLE)).not.toBe(computeConstitutionHash(altered));
  });

  it('does NOT change when only the content-hash value changes', () => {
    const updated = SAMPLE.replace('abc123def456', 'zzzzzz');
    expect(computeConstitutionHash(SAMPLE)).toBe(computeConstitutionHash(updated));
  });
});
