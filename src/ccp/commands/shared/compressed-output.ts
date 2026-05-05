import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { taskRawFile } from '../../task-paths';

const SUMMARY_THRESHOLD = 200;

export interface CompressedOutput {
  summary: string;
  rawOutputRef: string; // path relative to repo root
}

export function compressOutput(args: {
  repoRoot: string;
  taskId: string;
  stdout: string;
  stderr: string;
  command?: string;
}): CompressedOutput {
  const combined = args.stderr ? `${args.stdout}\n--- stderr ---\n${args.stderr}\n` : args.stdout;

  const hash = createHash('sha256')
    .update(`${args.command ?? ''}::${combined}`, 'utf-8')
    .digest('hex')
    .slice(0, 12);

  const rawAbs = taskRawFile(args.repoRoot, args.taskId, hash);
  mkdirSync(dirname(rawAbs), { recursive: true });
  writeFileSync(rawAbs, combined, 'utf-8');

  const lines = args.stdout.split('\n').filter((l) => l.length > 0);
  let summary: string;
  if (combined.length <= SUMMARY_THRESHOLD) {
    summary = combined.trim();
  } else if (lines.length <= 1) {
    summary = (lines[0] ?? args.stderr.trim().split('\n')[0] ?? '').slice(0, SUMMARY_THRESHOLD);
  } else {
    summary = `${lines[0]} … ${lines[lines.length - 1]}`;
  }

  return {
    summary,
    rawOutputRef: relative(args.repoRoot, rawAbs).replace(/\\/g, '/'),
  };
}
