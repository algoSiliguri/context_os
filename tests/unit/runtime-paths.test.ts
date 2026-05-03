import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  eventLogPath,
  lockPath,
  runtimeDir,
  sessionSnapshotPath,
} from '../../src/core/runtime-paths';

describe('runtime-paths', () => {
  const root = '/tmp/agent-os-test-root';

  it('runtimeDir returns <root>/.agent-os/runtime', () => {
    expect(runtimeDir(root)).toBe(join(root, '.agent-os', 'runtime'));
  });

  it('lockPath returns <root>/.agent-os.lock', () => {
    expect(lockPath(root)).toBe(join(root, '.agent-os.lock'));
  });

  it('eventLogPath returns runtime/events.jsonl', () => {
    expect(eventLogPath(root)).toBe(join(root, '.agent-os', 'runtime', 'events.jsonl'));
  });

  it('sessionSnapshotPath returns runtime/session.json', () => {
    expect(sessionSnapshotPath(root)).toBe(join(root, '.agent-os', 'runtime', 'session.json'));
  });
});
