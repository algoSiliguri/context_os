import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SessionDashboard, TimelineEntry } from './projector';
import { type HealthStatus, ageLabel, classifyHealth, timeLabel } from './health';
import { runtimeDir, sessionDashboardPath } from './runtime-paths';

// ── ANSI ─────────────────────────────────────────────────────────────────────

const USE_ANSI =
  typeof process !== 'undefined' &&
  process.stdout?.isTTY === true &&
  process.env['NO_COLOR'] === undefined;

const CODES: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function c(color: string, text: string): string {
  if (!USE_ANSI) return text;
  return `${CODES[color] ?? ''}${text}${CODES.reset}`;
}

// ── Health colors ─────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<HealthStatus, string> = {
  HEALTHY: 'green',
  DONE: 'cyan',
  LOOPING: 'yellow',
  STUCK: 'yellow',
  FAILED: 'red',
};

function healthLine(status: HealthStatus, dashboard: SessionDashboard): string {
  const col = HEALTH_COLOR[status];
  const dot = c(col, '●');
  const label = c(col, status.padEnd(8));
  const task = dashboard.current_task_id ? c('bold', dashboard.current_task_id) : '—';
  const state = c('dim', dashboard.current_state ?? '—');
  return `${dot} ${label}  ${task}  ${state}`;
}

// ── Pack badge ────────────────────────────────────────────────────────────────

export type PackVersionState = 'current' | 'stale' | 'newer' | 'unknown' | 'modified-locally';

const PACK_GLYPH: Record<PackVersionState, { ansi: string; ascii: string; color: string }> = {
  current:            { ansi: '✓', ascii: '[ok]', color: 'green' },
  stale:              { ansi: '⚠', ascii: '[!]',  color: 'yellow' },
  newer:              { ansi: '↑', ascii: '[^]',  color: 'cyan' },
  unknown:            { ansi: '?', ascii: '[?]',  color: 'yellow' },
  'modified-locally': { ansi: '~', ascii: '[~]',  color: 'yellow' },
};

export function renderPackBadge(
  state: PackVersionState,
  packId: string,
  version: string,
  bundledVersion?: string,
): string {
  const g = PACK_GLYPH[state];
  const glyph = c(g.color, USE_ANSI ? g.ansi : g.ascii);
  const idPart = `${packId}@${version}`;
  let suffix: string = state;
  if (state === 'stale' && bundledVersion) suffix = `stale (bundled v${bundledVersion})`;
  if (state === 'newer' && bundledVersion) suffix = `newer than bundled v${bundledVersion}`;
  return `${idPart} ${glyph} ${suffix}`;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function renderProgressBar(
  current: number,
  total: number,
  width: number = 8,
): string {
  const t = Math.max(1, total);
  const c0 = Math.max(0, Math.min(current, t));
  const cells = Math.max(1, width);
  const filled = Math.round((c0 / t) * cells);
  const empty = cells - filled;
  const filledChar = USE_ANSI ? '█' : '#';
  const emptyChar = USE_ANSI ? '░' : '-';
  return `${c0}/${t}  [${filledChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
}

// ── Validator summary ─────────────────────────────────────────────────────────

export interface ValidatorOutcome {
  ok: boolean;
  findings?: Array<{ message: string }>;
  /** Optional severity hint; defaults to 'fail' when !ok, 'pass' when ok */
  severity?: 'pass' | 'warn' | 'fail';
}

export function renderValidatorSummary(results: ValidatorOutcome[]): string {
  let pass = 0, fail = 0, warn = 0;
  for (const r of results) {
    const sev = r.severity ?? (r.ok ? 'pass' : 'fail');
    if (sev === 'pass') pass++;
    else if (sev === 'warn') warn++;
    else fail++;
  }
  const okGlyph = c('green', USE_ANSI ? '✓' : '[ok]');
  const failGlyph = c('red', USE_ANSI ? '✗' : '[x]');
  const warnGlyph = c('yellow', USE_ANSI ? '⚠' : '[!]');
  return `${okGlyph} ${pass}   ${failGlyph} ${fail}   ${warnGlyph} ${warn}`;
}

// ── Memory state ──────────────────────────────────────────────────────────────

export function renderMemoryState(pending: number): string {
  const n = Math.max(0, pending);
  const word = n === 1 ? 'candidate' : 'candidates';
  return `${n} ${word} pending${n > 0 ? ' approval' : ''}`;
}

// ── Timeline filter ───────────────────────────────────────────────────────────

const SHOW = new Set([
  'TASK_CREATED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'TASK_ABORTED',
  'TASK_STATE_TRANSITION',
  'PLAN_CREATED',
  'PLAN_APPROVED',
  'PLAN_REJECTED',
  'STEP_STARTED',
  'STEP_COMPLETED',
  'STEP_FAILED',
  'COMMAND_STARTED',
  'COMMAND_COMPLETED',
  'COMMAND_FAILED',
  'VERIFICATION_STARTED',
  'VERIFICATION_PASSED',
  'VERIFICATION_FAILED',
  'KNOWLEDGE_CAPTURE_APPROVED',
  'BRAIN_QUERY',
  'BRAIN_WRITE',
  'POLICY_DECISION',
]);

function filtered(entries: TimelineEntry[]): TimelineEntry[] {
  return entries.filter((e) => SHOW.has(e.event_type));
}

function row(entry: TimelineEntry): string {
  const t = c('dim', timeLabel(entry.timestamp));
  const label = entry.label.slice(0, 72);
  return `  ${t}  ${label}`;
}

// ── Status (summary view) ─────────────────────────────────────────────────────

export interface RenderStatusOpts {
  tail?: number;
  nowMs?: number;
}

export function renderStatusToString(
  sessionId: string,
  dashboard: SessionDashboard,
  opts: RenderStatusOpts = {},
): string {
  const tail = opts.tail ?? 5;
  const nowMs = opts.nowMs ?? Date.now();
  const status = classifyHealth(dashboard, nowMs);
  const recent = filtered(dashboard.timeline).slice(-tail);
  const sig = dashboard.signals;

  const lines: string[] = [healthLine(status, dashboard)];

  // ── Medium-density data block (Phase 2 additions) ──────────────────────────
  // Each row appears only if the corresponding field is populated on the dashboard.
  const dataLines: string[] = [];

  if (dashboard.active_pack) {
    const p = dashboard.active_pack;
    dataLines.push(`  Pack:        ${renderPackBadge(p.state, p.id, p.version, p.bundled_version)}`);
  }
  if (dashboard.phase_progress) {
    const pp = dashboard.phase_progress;
    dataLines.push(`  Phase:       ${renderProgressBar(pp.current, pp.total)}  (currently: ${pp.name})`);
  }
  if (dashboard.validator_outcomes) {
    const vo = dashboard.validator_outcomes;
    const summary = renderValidatorSummary([
      ...Array(vo.passed).fill({ ok: true }),
      ...Array(vo.failed).fill({ ok: false, severity: 'fail' as const, findings: [] }),
      ...Array(vo.warned).fill({ ok: false, severity: 'warn' as const, findings: [] }),
    ]);
    dataLines.push(`  Validators:  ${summary}`);
  }
  if (typeof dashboard.memory_pending === 'number') {
    dataLines.push(`  Memory:      ${renderMemoryState(dashboard.memory_pending)}`);
  }
  dataLines.push(`  Last event:  ${ageLabel(sig.last_event_timestamp, nowMs)}`);
  // Preserved from legacy layout for parity:
  dataLines.push(`  Failures:    ${sig.silent_failures}   Loop: ${sig.loop_detected ? c('yellow', 'YES') : 'no'}   Repeated queries: ${sig.repeated_queries > 0 ? c('yellow', String(sig.repeated_queries)) : '0'}`);

  lines.push('');
  lines.push(...dataLines);

  if (recent.length > 0) {
    lines.push('');
    lines.push(c('dim', '  Recent:'));
    for (const e of recent) lines.push(row(e));
  }

  return lines.join('\n');
}

// ── Trace (full timeline view) ────────────────────────────────────────────────

export interface RenderTraceOpts {
  tail?: number;
  nowMs?: number;
}

export function renderTraceToString(
  sessionId: string,
  dashboard: SessionDashboard,
  opts: RenderTraceOpts = {},
): string {
  const tail = opts.tail ?? 10;
  const nowMs = opts.nowMs ?? Date.now();
  const status = classifyHealth(dashboard, nowMs);
  const all = filtered(dashboard.timeline);
  const shown = all.slice(-tail);
  const sig = dashboard.signals;
  const bar = c('dim', '─'.repeat(58));

  const lines: string[] = [
    bar,
    `  Session ${c('dim', sessionId.slice(0, 8))}  ${healthLine(status, dashboard)}`,
  ];
  if (dashboard.active_pack) {
    const p = dashboard.active_pack;
    lines.push(`  Pack:        ${renderPackBadge(p.state, p.id, p.version, p.bundled_version)}`);
  }
  lines.push(bar);

  if (shown.length === 0) {
    lines.push(c('dim', '  No events yet.'));
  } else {
    const omitted = all.length - shown.length;
    if (omitted > 0) lines.push(c('dim', `  … ${omitted} earlier events`));
    for (const e of shown) lines.push(row(e));
  }

  lines.push(
    bar,
    c(
      'dim',
      `  signals: loop=${sig.loop_detected}  failures=${sig.silent_failures}  repeated_q=${sig.repeated_queries}  last=${ageLabel(sig.last_event_timestamp, nowMs)}`,
    ),
  );

  return lines.join('\n');
}

// ── Markdown report ───────────────────────────────────────────────────────────

export function writeReportMd(
  repoRoot: string,
  sessionId: string,
  dashboard: SessionDashboard,
  nowMs: number = Date.now(),
): string {
  const status = classifyHealth(dashboard, nowMs);
  const sig = dashboard.signals;
  const rows = filtered(dashboard.timeline)
    .map((e) => `| ${timeLabel(e.timestamp)} | ${e.event_type} | ${e.label.replace(/\|/g, '\\|')} |`)
    .join('\n');

  const md = [
    `# Agent OS Session Report`,
    '',
    `**Session:** \`${sessionId}\`  `,
    `**Status:** ${status}  `,
    `**Task:** ${dashboard.current_task_id ?? '—'}  `,
    `**State:** ${dashboard.current_state ?? '—'}  `,
    `**Generated:** ${new Date(nowMs).toISOString()}  `,
    '',
    `## Timeline`,
    '',
    `| Time | Event | Detail |`,
    `|------|-------|--------|`,
    rows || `| — | — | No events |`,
    '',
    `## Signals`,
    '',
    `| Signal | Value |`,
    `|--------|-------|`,
    `| Loop detected | ${sig.loop_detected ? '**YES**' : 'No'} |`,
    `| Silent failures | ${sig.silent_failures} |`,
    `| Repeated queries | ${sig.repeated_queries} |`,
    `| Last event | ${sig.last_event_timestamp ?? '—'} |`,
  ].join('\n');

  const reportPath = sessionDashboardPath(repoRoot, sessionId).replace(
    'dashboard.json',
    'report.md',
  );
  writeFileSync(reportPath, md, 'utf-8');
  return reportPath;
}

// ── Session discovery ─────────────────────────────────────────────────────────

export function findMostRecentSession(repoRoot: string): string | null {
  const sessionsDir = join(runtimeDir(repoRoot), 'sessions');
  if (!existsSync(sessionsDir)) return null;
  const dirs = readdirSync(sessionsDir);
  if (dirs.length === 0) return null;
  return (
    dirs
      .map((id) => {
        const dashPath = join(sessionsDir, id, 'dashboard.json');
        const mtime = existsSync(dashPath) ? statSync(dashPath).mtimeMs : 0;
        return { id, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)[0]?.id ?? null
  );
}

export function loadSessionDashboard(
  repoRoot: string,
  sessionId: string,
): SessionDashboard | null {
  const dashPath = sessionDashboardPath(repoRoot, sessionId);
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as SessionDashboard;
  } catch {
    return null;
  }
}
