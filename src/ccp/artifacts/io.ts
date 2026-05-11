// src/ccp/artifacts/io.ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import YAML from 'yaml';
import { type ArtifactType, taskArtifactPath } from '../task-paths';
import type { ArtifactEnvelope } from './envelope';

// Artifact types that have TypeBox schemas registered in this file.
type SchemaArtifactType =
  | 'diagnosis'
  | 'evaluation'
  | 'execution'
  | 'grill'
  | 'knowledge'
  | 'plan'
  | 'quick-task'
  | 'review'
  | 'verification';
import { DiagnosisRecord } from './diagnosis-record';
import { EvaluationRecord } from './evaluation-record';
import { ExecutionRecord } from './execution-record';
import { GrillRecord } from './grill-record';
import { KnowledgeCaptureRecord } from './knowledge-capture-record';
import { PlanArtifact } from './plan-artifact';
import { QuickTaskRecord } from './quick-task-record';
import { ReviewRecord } from './review-record';
import { VerificationRecord } from './verification-record';

const SCHEMA_BY_TYPE = {
  diagnosis: DiagnosisRecord,
  evaluation: EvaluationRecord,
  execution: ExecutionRecord,
  grill: GrillRecord,
  knowledge: KnowledgeCaptureRecord,
  plan: PlanArtifact,
  'quick-task': QuickTaskRecord,
  review: ReviewRecord,
  verification: VerificationRecord,
} as const;

const NAME_BY_TYPE = {
  diagnosis: 'DiagnosisRecord',
  evaluation: 'EvaluationRecord',
  execution: 'ExecutionRecord',
  grill: 'GrillRecord',
  knowledge: 'KnowledgeCaptureRecord',
  plan: 'PlanArtifact',
  'quick-task': 'QuickTaskRecord',
  review: 'ReviewRecord',
  verification: 'VerificationRecord',
} as const;

export function writeArtifact<T extends SchemaArtifactType>(
  repoRoot: string,
  taskId: string,
  type: T,
  record: unknown,
): void {
  const schema = SCHEMA_BY_TYPE[type];
  if (!Value.Check(schema, record)) {
    const errors = [...Value.Errors(schema, record)];
    throw new Error(`invalid ${NAME_BY_TYPE[type]}: ${errors[0]?.message ?? 'unknown error'}`);
  }
  const path = taskArtifactPath(repoRoot, taskId, type);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, YAML.stringify(record, { indent: 2 }), 'utf-8');
  renameSync(tmp, path);
}

// Read without TypeBox schema validation — for artifact types without a schema yet.
export function readArtifactRaw(
  repoRoot: string,
  taskId: string,
  type: ArtifactType,
): Record<string, unknown> | null {
  try {
    const path = taskArtifactPath(repoRoot, taskId, type);
    const text = readFileSync(path, 'utf-8');
    const parsed = YAML.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

// Write without TypeBox schema validation — for artifact types without a schema yet.
export function writeArtifactRaw(
  repoRoot: string,
  taskId: string,
  type: ArtifactType,
  record: unknown,
): void {
  const path = taskArtifactPath(repoRoot, taskId, type);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, YAML.stringify(record, { indent: 2 }), 'utf-8');
  renameSync(tmp, path);
}

export function readArtifact<T extends SchemaArtifactType>(
  repoRoot: string,
  taskId: string,
  type: T,
): ArtifactEnvelope {
  const path = taskArtifactPath(repoRoot, taskId, type);
  const text = readFileSync(path, 'utf-8');
  const parsed = YAML.parse(text);
  const schema = SCHEMA_BY_TYPE[type];
  if (!Value.Check(schema, parsed)) {
    const errors = [...Value.Errors(schema, parsed)];
    throw new Error(
      `invalid ${NAME_BY_TYPE[type]} on disk: ${errors[0]?.message ?? 'unknown error'}`,
    );
  }
  return parsed;
}
