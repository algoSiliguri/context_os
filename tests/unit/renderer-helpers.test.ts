import { describe, expect, it } from 'vitest';
import { renderPackBadge } from '../../src/core/renderer';

describe('renderPackBadge', () => {
  it('formats a current pack with checkmark', () => {
    const out = renderPackBadge('current', 'engineering-core', '1.0.0');
    expect(out).toMatch(/engineering-core@1\.0\.0/);
    expect(out).toMatch(/current/);
  });

  it('formats a stale pack with warning and bundled version', () => {
    const out = renderPackBadge('stale', 'engineering-core', '1.0.0', '1.1.0');
    expect(out).toMatch(/engineering-core@1\.0\.0/);
    expect(out).toMatch(/stale/);
    expect(out).toMatch(/1\.1\.0/);
  });

  it('formats a newer pack', () => {
    const out = renderPackBadge('newer', 'engineering-core', '1.2.0', '1.1.0');
    expect(out).toMatch(/newer/);
    expect(out).toMatch(/1\.1\.0/);
  });

  it('formats an unknown state', () => {
    const out = renderPackBadge('unknown', 'custom-pack', '0.5.0');
    expect(out).toMatch(/custom-pack@0\.5\.0/);
    expect(out).toMatch(/unknown/);
  });

  it('formats a modified-locally state', () => {
    const out = renderPackBadge('modified-locally', 'engineering-core', '1.0.0');
    expect(out).toMatch(/modified-locally/);
  });
});
