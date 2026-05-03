import { existsSync, readFileSync } from 'node:fs';
import type { Event } from './events';

export function readEvents(path: string): Event[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Event);
}

export { appendJsonlEventAtomic as appendEvent } from './session-store';
