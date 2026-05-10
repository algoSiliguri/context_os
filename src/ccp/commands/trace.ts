import {
  findMostRecentSession,
  loadSessionDashboard,
  renderTraceToString,
  writeReportMd,
} from '../../core/renderer';

export interface RunTraceArgs {
  repoRoot: string;
  sessionId?: string;
  tail?: number;
}

export async function runTrace(args: RunTraceArgs): Promise<void> {
  const sessionId = args.sessionId ?? findMostRecentSession(args.repoRoot);
  if (!sessionId) {
    process.stdout.write('No sessions found in this project.\n');
    return;
  }

  const dashboard = loadSessionDashboard(args.repoRoot, sessionId);
  if (!dashboard) {
    process.stdout.write(`Session ${sessionId}: no dashboard.json found.\n`);
    return;
  }

  const text = renderTraceToString(sessionId, dashboard, { tail: args.tail });
  process.stdout.write(text + '\n');

  const reportPath = writeReportMd(args.repoRoot, sessionId, dashboard);
  process.stdout.write(`\n  report → ${reportPath}\n`);
}
