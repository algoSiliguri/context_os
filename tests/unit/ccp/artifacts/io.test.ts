import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// tests/unit/ccp/artifacts/io.test.ts
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { readArtifact, writeArtifact } from '../../../../src/ccp/artifacts/io';
import { DiagnosisRecord } from '../../../../src/ccp/artifacts/diagnosis-record';
import { EvaluationRecord } from '../../../../src/ccp/artifacts/evaluation-record';
import { ExecutionRecord } from '../../../../src/ccp/artifacts/execution-record';
import { GrillRecord } from '../../../../src/ccp/artifacts/grill-record';
import { KnowledgeCaptureRecord } from '../../../../src/ccp/artifacts/knowledge-capture-record';
import { PlanArtifact } from '../../../../src/ccp/artifacts/plan-artifact';
import { QuickTaskRecord } from '../../../../src/ccp/artifacts/quick-task-record';
import { ReviewRecord } from '../../../../src/ccp/artifacts/review-record';
import { VerificationRecord } from '../../../../src/ccp/artifacts/verification-record';

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

  // Regression: review.ts and evaluate.ts now use readArtifact (validated, throws)
  // instead of readArtifactRaw (returns null). These confirm the validated path
  // rejects missing artifacts for the exact types those commands read.
  it('readArtifact throws when plan file missing (review.ts regression)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    expect(() => readArtifact(dir, 'T-999', 'plan')).toThrow();
  });

  it('readArtifact throws when verification file missing (review.ts + evaluate.ts regression)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    expect(() => readArtifact(dir, 'T-999', 'verification')).toThrow();
  });

  it('readArtifact throws when review file missing (evaluate.ts regression)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-aio-'));
    expect(() => readArtifact(dir, 'T-999', 'review')).toThrow();
  });
});

describe('all 9 artifact types: write→read round-trip', () => {
  const taskId = 'T-001';

  function dir() {
    return mkdtempSync(join(tmpdir(), 'aos-rt-'));
  }

  it('diagnosis round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(DiagnosisRecord), task_id: taskId };
    writeArtifact(d, taskId, 'diagnosis', record);
    expect(readArtifact(d, taskId, 'diagnosis')).toEqual(record);
  });

  it('evaluation round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(EvaluationRecord), task_id: taskId };
    writeArtifact(d, taskId, 'evaluation', record);
    expect(readArtifact(d, taskId, 'evaluation')).toEqual(record);
  });

  it('execution round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(ExecutionRecord), task_id: taskId };
    writeArtifact(d, taskId, 'execution', record);
    expect(readArtifact(d, taskId, 'execution')).toEqual(record);
  });

  it('grill round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(GrillRecord), task_id: taskId };
    writeArtifact(d, taskId, 'grill', record);
    expect(readArtifact(d, taskId, 'grill')).toEqual(record);
  });

  it('knowledge round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(KnowledgeCaptureRecord), task_id: taskId };
    writeArtifact(d, taskId, 'knowledge', record);
    expect(readArtifact(d, taskId, 'knowledge')).toEqual(record);
  });

  it('plan round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(PlanArtifact), task_id: taskId };
    writeArtifact(d, taskId, 'plan', record);
    expect(readArtifact(d, taskId, 'plan')).toEqual(record);
  });

  it('quick-task round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(QuickTaskRecord), task_id: taskId };
    writeArtifact(d, taskId, 'quick-task', record);
    expect(readArtifact(d, taskId, 'quick-task')).toEqual(record);
  });

  it('review round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(ReviewRecord), task_id: taskId };
    writeArtifact(d, taskId, 'review', record);
    expect(readArtifact(d, taskId, 'review')).toEqual(record);
  });

  it('verification round-trip', () => {
    const d = dir();
    const record = { ...Value.Create(VerificationRecord), task_id: taskId };
    writeArtifact(d, taskId, 'verification', record);
    expect(readArtifact(d, taskId, 'verification')).toEqual(record);
  });
});
