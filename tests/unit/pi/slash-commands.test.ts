import { describe, expect, it } from 'vitest';
import { ALL_COMMANDS, makeAllStubs, makeStubHandler } from '../../../src/pi/slash-commands';

describe('slash-commands', () => {
  it('exports the six v1 commands', () => {
    expect(ALL_COMMANDS).toEqual(['grill', 'plan', 'run', 'verify', 'remember', 'status']);
  });

  it('makeStubHandler logs "not implemented" without throwing', async () => {
    const logs: string[] = [];
    const handler = makeStubHandler('grill', { log: (m) => logs.push(m) });
    await handler('add rate limit');
    expect(logs.join(' ')).toContain('not implemented');
    expect(logs.join(' ')).toContain('grill');
  });

  it('makeAllStubs returns handlers for every command that log "not implemented"', async () => {
    const logs: string[] = [];
    const stubs = makeAllStubs({ log: (m) => logs.push(m) });
    for (const name of ALL_COMMANDS) {
      expect(typeof stubs[name]).toBe('function');
      await stubs[name]('args');
    }
    expect(logs).toHaveLength(6);
    for (const name of ALL_COMMANDS) {
      expect(logs.some((l) => l.includes(`/${name}`) && l.includes('not implemented'))).toBe(true);
    }
  });
});
