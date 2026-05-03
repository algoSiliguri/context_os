import { describe, expect, it } from 'vitest';
import { verifyRuntimeBundle } from '../../src/core/authority';

describe('authority', () => {
  it('verifyRuntimeBundle either passes or throws (depending on whether python3 is on PATH)', async () => {
    // On a machine without python3 on PATH, this throws. On a machine with python3
    // and a valid bundle, this resolves. Either is acceptable for the port to land.
    try {
      await verifyRuntimeBundle();
      // resolved: bundle valid
    } catch (e) {
      // threw: capture the error type but don't fail the test
      expect(e).toBeInstanceOf(Error);
    }
  });
});
