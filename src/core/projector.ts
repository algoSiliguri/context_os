import { existsSync, readFileSync } from 'node:fs';
import type { Event } from './events';
import { sessionDashboardPath, sessionEventsPath } from './runtime-paths';
import { appendJsonlEventAtomic, writeJsonAtomic } from './session-store';

export interface TimelineEntry {
  timestamp: string;
  event_type: string;
  label: string;
  task_id?: string;
}

export interface SessionDashboard {
  session_id: string;
  last_updated: string;
  current_state: string | null;
  current_task_id: string | null;
  current_pack?: { id: string; version: string } | null;
  current_phase?: string | null;
  last_completed_phase?: string | null;
  timeline: TimelineEntry[];
  signals: {
    loop_detected: boolean;
    silent_failures: number;
    repeated_queries: number;
    last_event_timestamp: string | null;
    transition_counts: Record<string, number>;
    query_counts: Record<string, number>;
  };
}

function blank(sessionId: string): SessionDashboard {
  return {
    session_id: sessionId,
    last_updated: new Date().toISOString(),
    current_state: null,
    current_task_id: null,
    current_pack: null,
    current_phase: null,
    last_completed_phase: null,
    timeline: [],
    signals: {
      loop_detected: false,
      silent_failures: 0,
      repeated_queries: 0,
      last_event_timestamp: null,
      transition_counts: {},
      query_counts: {},
    },
  };
}

function loadDashboard(path: string, sessionId: string): SessionDashboard {
  if (!existsSync(path)) return blank(sessionId);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SessionDashboard;
  } catch {
    return blank(sessionId);
  }
}

function labelFor(event: Event): string {
  const p = event.payload;
  const str = (v: unknown, max = 80) => String(v ?? '').slice(0, max);
  switch (event.event_type) {
    case 'TASK_CREATED':
      return `New task: ${str(p.goal, 60)}`;
    case 'TASK_STATE_TRANSITION':
      return `${str(p.from)} → ${str(p.to)}`;
    case 'GRILL_STARTED':
      return 'Gathering requirements';
    case 'QUESTION_ASKED':
      return `Q: ${str(p.question)}`;
    case 'ANSWER_RECORDED':
      return `A: ${str(p.answer)}`;
    case 'SHARED_UNDERSTANDING_CREATED':
      return 'Requirements complete';
    case 'PLAN_CREATED':
      return `Plan drafted (${p.step_count} steps)`;
    case 'PLAN_APPROVED':
      return 'Plan approved';
    case 'PLAN_REJECTED':
      return `Plan rejected: ${str(p.reason)}`;
    case 'STEP_STARTED':
      return `Step ${str(p.step_id)} started (${p.command_count} cmd)`;
    case 'STEP_COMPLETED':
      return `Step ${str(p.step_id)} complete`;
    case 'STEP_FAILED':
      return `Step ${str(p.step_id)} FAILED: ${str(p.reason, 60)}`;
    case 'COMMAND_STARTED':
      return `Running: ${str(p.command)}`;
    case 'COMMAND_COMPLETED':
      return `Done: ${str(p.command)}`;
    case 'COMMAND_FAILED':
      return `FAILED: ${str(p.summary)}`;
    case 'VERIFICATION_STARTED':
      return 'Verifying results';
    case 'VERIFICATION_PASSED':
      return 'Verification passed';
    case 'VERIFICATION_FAILED':
      return `Verification failed: ${str(p.summary, 60)}`;
    case 'KNOWLEDGE_CAPTURE_PROPOSED':
      return `Memory capture proposed (${str(p.capture_type)})`;
    case 'KNOWLEDGE_CAPTURE_APPROVED':
      return 'Memory saved to brain';
    case 'KNOWLEDGE_CAPTURE_REJECTED':
      return 'Memory capture skipped';
    case 'TASK_COMPLETED':
      return 'Task complete';
    case 'TASK_FAILED':
      return `Task failed: ${str(p.reason, 60)}`;
    case 'TASK_ABORTED':
      return `Task aborted: ${str(p.reason, 60)}`;
    case 'BRAIN_QUERY':
      return `Memory query → ${p.result_count} result${p.result_count === 1 ? '' : 's'} (${p.latency_ms}ms)`;
    case 'BRAIN_WRITE':
      return `Memory written (confidence ${p.confidence}, ${p.latency_ms}ms)`;
    case 'WORKFLOW_PACK_LOADED':
      return `Pack loaded: ${str(p.pack_id)} v${str(p.pack_version)} (${p.phase_count} phases)`;
    case 'WORKFLOW_PACK_LOAD_FAILED':
      return `Pack load failed: ${str(p.error, 80)}`;
    case 'PHASE_STARTED':
      return `Phase started: ${str(p.phase_id)}`;
    case 'PHASE_COMPLETED':
      return `Phase done: ${str(p.phase_id)} → next: ${str((p.next_allowed_phases as string[]).join(', '), 60)}`;
    case 'PHASE_FAILED':
      return `Phase failed: ${str(p.phase_id)} — ${str(p.reason, 60)}`;
    case 'PHASE_BLOCKED_PREDECESSOR':
      return `Phase blocked: ${str(p.phase_id)} — needs ${str((p.missing_predecessors as string[]).join(' or '), 60)}`;
    case 'VALIDATOR_STARTED':
      return `Validator running: ${str(p.validator_id)} [${str(p.mode)}]`;
    case 'VALIDATOR_PASSED':
      return `Validator passed: ${str(p.validator_id)}`;
    case 'VALIDATOR_FAILED':
      return `Validator ${str(p.mode) === 'advisory' ? 'warn' : 'FAILED'}: ${str(p.validator_id)}`;
    case 'POLICY_DECISION': {
      const icon = p.decision === 'allow' || p.decision === 'approved' ? '✓' : p.decision === 'block' || p.decision === 'rejected' ? '✗' : '?';
      return `[policy] ${icon} ${str(p.decision)} ${str(p.subject_name)} (${str(p.reason_code)}) src=${str(p.source)}`;
    }
    default:
      return event.event_type;
  }
}

function applyEvent(d: SessionDashboard, event: Event): void {
  const taskId = typeof event.payload.task_id === 'string' ? event.payload.task_id : undefined;

  if (event.event_type === 'TASK_CREATED' && taskId) {
    d.current_task_id = taskId;
  }

  if (event.event_type === 'TASK_STATE_TRANSITION') {
    const from = String(event.payload.from ?? '');
    const to = String(event.payload.to ?? '');
    d.current_state = to;
    // loop detection: same transition >= 3 times in a session
    const key = `${from}->${to}`;
    d.signals.transition_counts[key] = (d.signals.transition_counts[key] ?? 0) + 1;
    if (d.signals.transition_counts[key] >= 3) {
      d.signals.loop_detected = true;
    }
  }

  if (event.event_type === 'COMMAND_FAILED' || event.event_type === 'STEP_FAILED') {
    d.signals.silent_failures += 1;
  }

  if (event.event_type === 'WORKFLOW_PACK_LOADED') {
    d.current_pack = {
      id: String(event.payload.pack_id ?? ''),
      version: String(event.payload.pack_version ?? ''),
    };
  }

  if (event.event_type === 'PHASE_STARTED') {
    d.current_phase = String(event.payload.phase_id ?? '');
  }

  if (event.event_type === 'PHASE_COMPLETED') {
    d.last_completed_phase = String(event.payload.phase_id ?? '');
    d.current_phase = null;
  }

  if (event.event_type === 'PHASE_FAILED') {
    d.current_phase = null;
  }

  if (event.event_type === 'BRAIN_QUERY') {
    const hash = String(event.payload.query_hash ?? '');
    if (hash) {
      d.signals.query_counts[hash] = (d.signals.query_counts[hash] ?? 0) + 1;
      if (d.signals.query_counts[hash] === 3) {
        d.signals.repeated_queries += 1;
      }
    }
  }

  d.timeline.push({
    timestamp: event.timestamp,
    event_type: event.event_type,
    label: labelFor(event),
    ...(taskId ? { task_id: taskId } : {}),
  });

  d.signals.last_event_timestamp = event.timestamp;
  d.last_updated = new Date().toISOString();
}

export function projectEvent(repoRoot: string, sessionId: string, event: Event): void {
  const dashPath = sessionDashboardPath(repoRoot, sessionId);
  const dashboard = loadDashboard(dashPath, sessionId);
  applyEvent(dashboard, event);
  writeJsonAtomic(dashPath, dashboard);
}

export function emitAndProject(repoRoot: string, sessionId: string, event: Event): void {
  appendJsonlEventAtomic(sessionEventsPath(repoRoot, sessionId), event);
  try {
    projectEvent(repoRoot, sessionId, event);
  } catch {
    // dashboard is best-effort; events.jsonl is the truth
  }
}
