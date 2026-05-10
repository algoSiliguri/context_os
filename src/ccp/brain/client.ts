// src/ccp/brain/client.ts
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { BindingError } from '../../core/binding';
import { emitAndProject } from '../../core/projector';
import type { CaptureType } from '../artifacts/knowledge-capture-record';
import { taskPendingCapturesPath } from '../task-paths';
import { buildBrainQueryEvent, buildBrainWriteEvent } from './brain-events';

const execFileAsync = promisify(execFile);

export interface BrainSpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type BrainSpawnFn = (cmd: string, args: string[]) => Promise<BrainSpawnResult>;

/** Minimum knowledge-brain protocol version Agent_OS requires. */
export const MIN_PROTOCOL_VERSION = '1.0.0';

const defaultSpawn: BrainSpawnFn = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args);
  return { stdout, stderr, exitCode: 0 };
};

export interface BrainNode {
  id: string;
  content: string;
  tags: string[];
  created_at: string;
  confidence: number;
}

export interface BrainQueryResult {
  query: string;
  items: Array<{ id: string; content: string; [k: string]: unknown }>;
  total_matches: number;
  returned_count: number;
}

export interface WriteResult {
  id: string | null; // null when deferred
  deferred: boolean;
  reason?: string;
}

export interface BrainClientOptions {
  /** Explicit DB path. When absent, the brain CLI resolves via BRAIN_DB_PATH env or its own default. */
  dbPath?: string;
  spawn?: BrainSpawnFn;
  repoRoot?: string; // required for queueing on failure
  sessionId?: string; // when set, brain ops emit to session trajectory
}

const CONFIDENCE: Record<CaptureType, number> = {
  decision: 0.95,
  architecture: 0.95,
  warning: 0.9,
  command: 0.85,
  convention: 0.85,
  failure: 0.85,
  pattern: 0.7,
};

export class BrainClient {
  private readonly dbPath: string | undefined;
  private readonly spawn: BrainSpawnFn;
  private readonly repoRoot: string | undefined;
  private readonly sessionId: string | undefined;

  constructor(opts: BrainClientOptions) {
    this.dbPath = opts.dbPath;
    this.spawn = opts.spawn ?? defaultSpawn;
    this.repoRoot = opts.repoRoot;
    this.sessionId = opts.sessionId;
  }

  private emitBrainEvent(event: ReturnType<typeof buildBrainQueryEvent>): void {
    if (!this.repoRoot || !this.sessionId) return;
    try {
      emitAndProject(this.repoRoot, this.sessionId, event);
    } catch {
      // brain events are best-effort
    }
  }

  private dbPathArgs(): string[] {
    return this.dbPath ? ['--db-path', this.dbPath] : [];
  }

  static confidenceFor(type: CaptureType): number {
    return CONFIDENCE[type];
  }

  async write(args: {
    content: string;
    type: CaptureType;
    scope: 'session' | 'project' | 'global';
    taskId: string;
    project: string;
    sourceType?: 'human' | 'session' | 'ingestion';
  }): Promise<WriteResult> {
    const tags = [
      `ccp:${args.taskId}`,
      `type:${args.type}`,
      `scope:${args.scope}`,
      `project:${args.project}`,
    ];
    const cliArgs = [
      ...this.dbPathArgs(),
      'write',
      args.content,
      '--tags',
      tags.join(','),
      '--confidence',
      String(BrainClient.confidenceFor(args.type)),
      ...(args.sourceType ? ['--source-type', args.sourceType] : []),
    ];
    const t0 = Date.now();
    try {
      const result = await this.spawn('brain', cliArgs);
      const node = JSON.parse(result.stdout) as BrainNode;
      this.emitBrainEvent(buildBrainWriteEvent({
        sessionId: this.sessionId ?? '',
        contentHash: createHash('sha256').update(args.content).digest('hex').slice(0, 8),
        tagCount: tags.length,
        confidence: BrainClient.confidenceFor(args.type),
        latencyMs: Date.now() - t0,
      }));
      return { id: node.id, deferred: false };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new BindingError('brain_cli_missing', `brain CLI not found on PATH: ${err.message}`);
      }
      return this.queueDeferred(args, err.message ?? String(e));
    }
  }

  async probe(): Promise<void> {
    let result: BrainSpawnResult;
    try {
      result = await this.spawn('brain', ['--protocol-version']);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      throw new BindingError('brain_cli_missing', `brain CLI not reachable: ${err.message}`);
    }
    const version = result.stdout.trim();
    if (!version) {
      throw new BindingError(
        'brain_protocol_incompatible',
        `brain CLI returned no protocol version (required >= ${MIN_PROTOCOL_VERSION}). Update knowledge-brain.`,
      );
    }
    if (!meetsMinVersion(version, MIN_PROTOCOL_VERSION)) {
      throw new BindingError(
        'brain_protocol_incompatible',
        `brain protocol ${version} < required ${MIN_PROTOCOL_VERSION}. Update knowledge-brain.`,
      );
    }
  }

  async export(outputPath: string): Promise<void> {
    const cliArgs = [...this.dbPathArgs(), 'export', outputPath];
    try {
      await this.spawn('brain', cliArgs);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new BindingError('brain_cli_missing', `brain CLI not found on PATH: ${err.message}`);
      }
      throw new Error(`brain export failed: ${(err as Error).message ?? String(e)}`);
    }
  }

  async query(args: {
    query: string;
    tags?: string[];
    max?: number;
  }): Promise<BrainQueryResult> {
    const cliArgs = [
      ...this.dbPathArgs(),
      'query',
      args.query,
      ...(args.tags ? ['--tags', args.tags.join(',')] : []),
      ...(args.max ? ['--max', String(args.max)] : []),
    ];
    const t0 = Date.now();
    try {
      const result = await this.spawn('brain', cliArgs);
      const parsed = JSON.parse(result.stdout) as BrainQueryResult;
      this.emitBrainEvent(buildBrainQueryEvent({
        sessionId: this.sessionId ?? '',
        queryHash: createHash('sha256').update(args.query).digest('hex').slice(0, 8),
        resultCount: parsed.returned_count,
        latencyMs: Date.now() - t0,
        tagCount: args.tags?.length ?? 0,
      }));
      return parsed;
    } catch {
      return { query: args.query, items: [], total_matches: 0, returned_count: 0 };
    }
  }

  private queueDeferred(
    args: {
      content: string;
      type: CaptureType;
      scope: 'session' | 'project' | 'global';
      taskId: string;
      project: string;
    },
    reason: string,
  ): WriteResult {
    if (!this.repoRoot) {
      return {
        id: null,
        deferred: false,
        reason: `brain unavailable, no repoRoot for queue: ${reason}`,
      };
    }
    const path = taskPendingCapturesPath(this.repoRoot, args.taskId);
    mkdirSync(dirname(path), { recursive: true });
    const entry = YAML.stringify([
      {
        content: args.content,
        type: args.type,
        scope: args.scope,
        project: args.project,
        queued_at: new Date().toISOString(),
        reason,
      },
    ]);
    appendFileSync(path, entry, 'utf-8');
    return { id: null, deferred: true, reason };
  }
}

/** Returns true if `actual` semver tuple >= `required` semver tuple. */
function meetsMinVersion(actual: string, required: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(actual);
  const [rMaj, rMin, rPat] = parse(required);
  if (aMaj !== rMaj) return aMaj! > rMaj!;
  if (aMin !== rMin) return aMin! > rMin!;
  return aPat! >= rPat!;
}
