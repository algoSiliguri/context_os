import { describe, expect, it } from 'vitest';
import { narrate, type NarrationTag } from '../../../src/core/narrator';

describe('narrator.narrate', () => {
  it('formats a tagged line as "[tag] message"', () => {
    expect(narrate('pack', 'agent-os-core v1.2.0 loaded')).toBe('[pack] agent-os-core v1.2.0 loaded');
  });

  it('trims trailing whitespace and newlines', () => {
    expect(narrate('phase', 'GRILLING  \n')).toBe('[phase] GRILLING');
    expect(narrate('phase', 'GRILLING\n')).toBe('[phase] GRILLING');
    expect(narrate('phase', 'GRILLING   ')).toBe('[phase] GRILLING');
  });

  it('collapses internal newlines to spaces — narration is single-line', () => {
    expect(narrate('validator', 'line1\nline2')).toBe('[validator] line1 line2');
  });

  it('throws on empty message', () => {
    expect(() => narrate('pack', '')).toThrow(/non-empty/);
    expect(() => narrate('pack', '   ')).toThrow(/non-empty/);
  });

  it('throws on unknown tag at compile time — runtime guard for non-TS callers', () => {
    // TypeScript should reject this; runtime guard exists for callers from non-TS code paths
    // @ts-expect-error — testing runtime guard
    expect(() => narrate('not-a-tag', 'x')).toThrow(/unknown tag/);
  });

  it('accepts every defined tag', () => {
    const tags: NarrationTag[] = [
      'pack', 'phase', 'doc', 'validator', 'step',
      'memory', 'plan', 'verify', 'review', 'evaluate',
      'doctor', 'trace',
    ];
    for (const t of tags) {
      expect(narrate(t, 'x')).toBe(`[${t}] x`);
    }
  });
});
