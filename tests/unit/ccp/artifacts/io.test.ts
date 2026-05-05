import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/unit/ccp/artifacts/io.test.ts
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { readArtifact, writeArtifact } from '../../../../src/ccp/artifacts/io';

describe('artifact io', () => {
  it('writeArtifact + readArtifact round-trips a GrillRecord', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    const env = makeEnvelope({ taskId: 'T-001', artifactType: 'GrillRecord' });
    const record = {
      ...env,
      goal: 'g',
      user_type: 'developer' as const,
      problem_statement: 'p',
      assumptions: [],
      questions: [],
      risks: [],
      constraints: [],
      success_criteria: [],
      decision: { proceed: true, reason: 'r' },
      open_blockers: [],
    };
    writeArtifact(dir, 'T-001', 'grill', record);
    const back = readArtifact(dir, 'T-001', 'grill');
    expect(back.task_id).toBe('T-001');
    expect((back as typeof record).goal).toBe('g');
  });

  it('writeArtifact rejects an invalid record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    mkdirSync(join(dir, '.agent-os', 'tasks', 'T-001'), { recursive: true });
    const bad = { task_id: 'T-001', artifact_type: 'GrillRecord' };
    expect(() => writeArtifact(dir, 'T-001', 'grill', bad)).toThrow(/invalid GrillRecord/);
  });

  it('readArtifact throws when file missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    expect(() => readArtifact(dir, 'T-999', 'grill')).toThrow();
  });
});
