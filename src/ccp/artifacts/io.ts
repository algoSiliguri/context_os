// src/ccp/artifacts/io.ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import YAML from 'yaml';
import { type ArtifactType, taskArtifactPath } from '../task-paths';
import type { ArtifactEnvelope } from './envelope';
import { ExecutionRecord } from './execution-record';
import { GrillRecord } from './grill-record';
import { KnowledgeCaptureRecord } from './knowledge-capture-record';
import { PlanArtifact } from './plan-artifact';
import { VerificationRecord } from './verification-record';

const SCHEMA_BY_TYPE = {
  grill: GrillRecord,
  plan: PlanArtifact,
  execution: ExecutionRecord,
  verification: VerificationRecord,
  knowledge: KnowledgeCaptureRecord,
} as const;

const NAME_BY_TYPE = {
  grill: 'GrillRecord',
  plan: 'PlanArtifact',
  execution: 'ExecutionRecord',
  verification: 'VerificationRecord',
  knowledge: 'KnowledgeCaptureRecord',
} as const;

export function writeArtifact<T extends ArtifactType>(
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

export function readArtifact<T extends ArtifactType>(
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
