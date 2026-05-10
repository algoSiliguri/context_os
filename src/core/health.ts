import type { SessionDashboard } from './projector';

export type HealthStatus = 'HEALTHY' | 'LOOPING' | 'STUCK' | 'FAILED' | 'DONE';

const TERMINAL = new Set(['COMPLETED', 'ABORTED']);
const FAILED = new Set(['FAILED_BLOCKED', 'FAILED_RECOVERABLE']);
const STUCK_THRESHOLD_MS = 90_000;

export function classifyHealth(
  dashboard: SessionDashboard,
  nowMs: number = Date.now(),
): HealthStatus {
  const { current_state, signals } = dashboard;
  if (!current_state) return 'HEALTHY';
  if (TERMINAL.has(current_state)) return 'DONE';
  if (FAILED.has(current_state)) return 'FAILED';
  if (signals.loop_detected) return 'LOOPING';
  if (signals.last_event_timestamp) {
    const age = nowMs - new Date(signals.last_event_timestamp).getTime();
    if (age > STUCK_THRESHOLD_MS) return 'STUCK';
  }
  return 'HEALTHY';
}

export function ageLabel(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return 'never';
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function timeLabel(iso: string): string {
  return iso.slice(11, 19); // HH:MM:SS from ISO string
}
