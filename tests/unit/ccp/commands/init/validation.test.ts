import { describe, expect, it } from 'vitest';
import {
  isValidProjectId,
  validateProjectId,
} from '../../../../../src/ccp/commands/init/validation';

describe('isValidProjectId', () => {
  it.each(['my-project', 'a', 'foo-bar-baz', 'project1', 'a-1-b-2'])('accepts %s', (id) => {
    expect(isValidProjectId(id)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['starts-with-digit', '1foo'],
    ['starts-with-dash', '-foo'],
    ['has-uppercase', 'Foo'],
    ['has-underscore', 'foo_bar'],
    ['has-space', 'foo bar'],
    ['has-special', 'foo@bar'],
    ['too-long', 'a'.repeat(64)],
  ])('rejects %s', (_label, id) => {
    expect(isValidProjectId(id)).toBe(false);
  });
});

describe('validateProjectId', () => {
  it('returns null on valid input', () => {
    expect(validateProjectId('my-project')).toBeNull();
  });

  it('returns a human message on invalid input', () => {
    const msg = validateProjectId('Foo');
    expect(msg).toContain('lowercase');
  });
});
