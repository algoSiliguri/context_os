import { describe, expect, it } from 'vitest';
import { resolveRuntimeVersion } from '../../src/core/versioning';

describe('versioning', () => {
  it('expands "0.1.x" to "0.1.0"', () => {
    expect(resolveRuntimeVersion('0.1.x')).toBe('0.1.0');
  });

  it('passes through specific versions unchanged', () => {
    expect(resolveRuntimeVersion('0.2.0')).toBe('0.2.0');
    expect(resolveRuntimeVersion('1.0.0-rc.1')).toBe('1.0.0-rc.1');
  });
});
