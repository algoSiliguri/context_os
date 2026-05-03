import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { deriveActionStatus } from '../../src/core/approval';
import { bindProject } from '../../src/core/binding';
import { readEvents } from '../../src/core/event-log';
import {
  buildBindingEvent,
  buildToolApprovedEvent,
  buildToolRequestedEvent,
} from '../../src/core/events';
import { computeConstitutionHash, computeJsonFileHash } from '../../src/core/hash';
import { eventLogPath } from '../../src/core/runtime-paths';
import { appendJsonlEventAtomic } from '../../src/core/session-store';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('bind-smoke E2E', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aos-smoke-'));
    mkdirSync(join(repoRoot, '.agent-os', 'schemas'), { recursive: true });
    mkdirSync(join(repoRoot, '.agent-os', 'contracts'), { recursive: true });
    mkdirSync(join(repoRoot, '.agent-os', 'runtime'), { recursive: true });

    const projectSchemas = join(__dirname, '..', '..', '.agent-os', 'schemas');
    for (const f of [
      'constitution-binding.schema.json',
      'telemetry-event.schema.json',
      'permission-manifest.schema.json',
    ]) {
      copyFileSync(join(projectSchemas, f), join(repoRoot, '.agent-os', 'schemas', f));
    }
    writeFileSync(join(repoRoot, '.agent-os', 'contracts', 'index.json'), '{}');

    let body = readFileSync(join(__dirname, '..', 'fixtures', 'constitution-good.md'), 'utf-8');
    const indexHash = computeJsonFileHash('{}');
    body = body.replace('contract-index-hash: ""', `contract-index-hash: "${indexHash}"`);
    const contentHash = computeConstitutionHash(body);
    body = body.replace('content-hash: ""', `content-hash: "${contentHash}"`);
    writeFileSync(join(repoRoot, 'AGENT_OS_CONSTITUTION.md'), body);

    writeFileSync(
      join(repoRoot, '.agent-os', 'project.yaml'),
      `project_id: smoke
domain_type: test
runtime_version: 0.1.0
memory_namespace: smoke
verification_profile: default
critical_actions: []
workspace:
  root: .
`,
    );
  });

  it('binds, emits binding event, runs an approval cycle, and queries status', async () => {
    const record = await bindProject(repoRoot, { skipBundleVerification: true });
    expect(record.state).toBe('BOUND');
    expect(record.session_id).toMatch(/^sess-/);

    const log = eventLogPath(repoRoot);
    appendJsonlEventAtomic(
      log,
      buildBindingEvent({
        sessionId: record.session_id,
        projectId: 'smoke',
        state: 'BOUND',
        conditionsVerified: record.verification_passed,
        runtimeVersion: record.runtime_version,
      }),
    );
    appendJsonlEventAtomic(
      log,
      buildToolRequestedEvent({
        sessionId: record.session_id,
        actionHash: 'h-smoke',
        capability: 'memory_write_global',
        paramsDigestSource: '{}',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      }),
    );
    appendJsonlEventAtomic(
      log,
      buildToolApprovedEvent({
        sessionId: record.session_id,
        actionHash: 'h-smoke',
        approverMeta: { user: 'test' },
      }),
    );

    const events = readEvents(log);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.event_type)).toEqual(['BINDING', 'TOOL_REQUESTED', 'TOOL_APPROVED']);

    const status = deriveActionStatus(log, {
      sessionId: record.session_id,
      actionHash: 'h-smoke',
    });
    expect(status.final_status).toBe('APPROVED');
    expect(status.executable).toBe(true);
  });
});
