import { existsSync, readFileSync } from 'node:fs';
import { type SessionStatus, makeSessionStatus } from '../artifacts/session-status';
import { taskStatePath } from '../task-paths';
import type { TaskState } from '../task-state-machine';
import { ageLabel, classifyHealth } from '../../core/health';
import {
  findMostRecentSession,
  loadSessionDashboard,
  renderStatusToString,
  writeReportMd,
} from '../../core/renderer';
import { getCurrentTaskId } from './shared/current-task';

export interface RunStatusArgs {
  repoRoot: string;
  taskId?: string;
  sessionId?: string;
  render?: boolean;
}

export async function runStatus(args: RunStatusArgs): Promise<SessionStatus | null> {
  const taskId = args.taskId ?? getCurrentTaskId(args.repoRoot);
  if (!taskId) return null;

  const statePath = taskStatePath(args.repoRoot, taskId);
  if (!existsSync(statePath)) return null;

  const stateRecord = JSON.parse(readFileSync(statePath, 'utf-8')) as { state?: string };
  const currentState = (stateRecord.state ?? 'COMPLETED') as TaskState;

  // Read dashboard.json if a session is available
  const sessionId = args.sessionId ?? findMostRecentSession(args.repoRoot);
  const dashboard = sessionId ? loadSessionDashboard(args.repoRoot, sessionId) : null;

  const lastEvent = dashboard?.signals.last_event_timestamp
    ? {
        event_type: dashboard.timeline.at(-1)?.event_type ?? 'unknown',
        age_seconds: Math.round(
          (Date.now() - new Date(dashboard.signals.last_event_timestamp).getTime()) / 1000,
        ),
      }
    : null;

  if (args.render && dashboard && sessionId) {
    const text = renderStatusToString(sessionId, dashboard);
    process.stdout.write(text + '\n');
    const reportPath = writeReportMd(args.repoRoot, sessionId, dashboard);
    process.stdout.write('\n' + `  report → ${reportPath}\n`);
  }

  return makeSessionStatus({
    taskId,
    currentState,
    currentStep: '—',
    riskTier: 'low',
    pendingApprovals: [],
    lastMeaningfulEvent: lastEvent,
    nextAction: deriveNextAction(currentState),
  });
}

function deriveNextAction(state: TaskState): string {
  switch (state) {
    case 'NEW_IDEA':
      return 'run /grill <idea> or /diagnose or /quick-task';
    case 'DIAGNOSING':
      return 'wait — diagnosis in progress';
    case 'QUICK_TASKING':
      return 'wait — quick task in progress';
    case 'GRILLING':
      return 'answer questions or type "done"';
    case 'SHARED_UNDERSTANDING':
      return 'run /plan';
    case 'PLANNING':
      return 'wait for plan to be drafted';
    case 'AWAITING_PLAN_APPROVAL':
      return 'approve / reject / modify';
    case 'EXECUTING':
      return 'wait or watch progress';
    case 'AWAITING_TOOL_APPROVAL':
      return 'approve or deny tool call';
    case 'VERIFYING':
      return 'wait';
    case 'AWAITING_HUMAN_REVIEW':
      return 'run /review';
    case 'EVALUATING':
      return 'run /evaluate';
    case 'PERSISTING_KNOWLEDGE':
      return 'approve each capture';
    case 'COMPLETED':
      return 'task done — start a new one';
    case 'FAILED_RECOVERABLE':
      return 'fix and run /run --resume';
    case 'FAILED_BLOCKED':
      return 'replan or /abort';
    case 'ABORTED':
      return 'task aborted — start a new one';
  }
}
