import { readEvents } from './event-log';
import type { Event } from './events';

export interface ActionStatus {
  final_status: 'NOT_ACTIONABLE' | 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  executable: boolean;
  blacklisted: boolean;
}

function eventValue(event: Event, key: string): unknown {
  if (event.payload && key in event.payload) return event.payload[key];
  return (event as unknown as Record<string, unknown>)[key];
}

export function deriveActionStatus(
  logPath: string,
  args: { sessionId: string; actionHash: string },
): ActionStatus {
  const now = new Date();
  let requestedEvent: Event | null = null;
  let approved = false;
  let finalStatus: ActionStatus['final_status'] = 'NOT_ACTIONABLE';

  for (const event of readEvents(logPath)) {
    if (event.session_id !== args.sessionId) continue;
    if (eventValue(event, 'action_hash') !== args.actionHash) continue;

    switch (event.event_type) {
      case 'TOOL_REQUESTED':
        requestedEvent = event;
        finalStatus = 'PENDING';
        break;
      case 'TOOL_DENIED': {
        const reason = String(eventValue(event, 'reason') ?? '');
        finalStatus = reason === 'auto_rejected_ttl_expired' ? 'EXPIRED' : 'DENIED';
        break;
      }
      case 'TOOL_APPROVED':
        if (finalStatus === 'PENDING') {
          approved = true;
          finalStatus = 'APPROVED';
        }
        break;
    }
  }

  if (requestedEvent && finalStatus === 'PENDING') {
    const expiresAt = new Date(String(eventValue(requestedEvent, 'expires_at')));
    if (now > expiresAt) finalStatus = 'EXPIRED';
  }

  const blacklisted = finalStatus === 'DENIED' || finalStatus === 'EXPIRED';
  const executable = approved && !blacklisted;
  return { final_status: finalStatus, executable, blacklisted };
}
