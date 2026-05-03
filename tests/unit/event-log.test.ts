import { describe, expect, it } from 'vitest';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJsonlEventAtomic } from '../../src/core/session-store';
import { readEvents } from '../../src/core/event-log';

describe('event-log', () => {
  it('readEvents on missing file returns []', () => {
    expect(readEvents('/nonexistent/path/events.jsonl')).toEqual([]);
  });

  it('readEvents reads back appended events in order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-evlog-'));
    const path = join(dir, 'events.jsonl');
    appendJsonlEventAtomic(path, { event_type: 'A', session_id: 's1' });
    appendJsonlEventAtomic(path, { event_type: 'B', session_id: 's1' });
    const events = readEvents(path);
    expect(events).toHaveLength(2);
    expect(events[0]?.event_type).toBe('A');
    expect(events[1]?.event_type).toBe('B');
  });

  it('skips empty lines defensively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-evlog-'));
    const path = join(dir, 'events.jsonl');
    appendJsonlEventAtomic(path, { event_type: 'A' });
    appendFileSync(path, '\n', 'utf-8');
    appendJsonlEventAtomic(path, { event_type: 'B' });
    expect(readEvents(path)).toHaveLength(2);
  });
});
