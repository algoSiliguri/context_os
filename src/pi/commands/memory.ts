import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { BrainClient } from '../../ccp/brain/client';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import {
  approveCandidate,
  listPendingCandidates,
  rejectCandidate,
} from '../../ccp/commands/shared/memory-staging';
import { emitPolicyDecision } from '../../ccp/commands/shared/policy-decision-writer';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { loadPolicyConfig } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, _session: PiSession): void {
  pi.registerCommand('memory', {
    description: 'Review pending memory candidates. Usage: /memory [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Pass task-id: /memory T-001', 'error');
        return;
      }
      const config = loadPolicyConfig(ctx.cwd);
      const brain = new BrainClient({ repoRoot: ctx.cwd });
      const sid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      const pending = listPendingCandidates(ctx.cwd, taskId);
      if (pending.length === 0) {
        ctx.ui.notify(`${taskId}: no pending memory candidates.`, 'info');
        return;
      }
      ctx.ui.notify(`${taskId}: ${pending.length} pending candidate(s). Reviewing…`, 'info');
      let kept = 0;
      let dropped = 0;
      for (const candidate of pending) {
        const keep = await ctx.ui.confirm(
          'Agent OS — memory recovery',
          `[${candidate.type}/${candidate.scope}] ${candidate.content}\n  Keep?`,
        );
        if (keep) {
          try {
            const result = await brain.write({
              content: candidate.content,
              type: candidate.type,
              scope: candidate.scope,
              taskId,
              project: (config as any).project_id ?? basename(ctx.cwd),
            });
            approveCandidate(ctx.cwd, taskId, candidate.id, result.id ?? undefined);
            emitPolicyDecision(ctx.cwd, sid, {
              taskId,
              subjectType: 'memory_write',
              subjectName: candidate.id,
              actionRequested: 'write to brain (orphan recovery)',
              decision: 'approved',
              reasonCode: 'human_approved_recovery',
              reason: 'user approved orphaned memory candidate',
              approvedBy: 'human',
              memoryCandidateRefs: [candidate.id],
              source: 'memory_staging',
            });
            kept++;
          } catch {
            ctx.ui.notify(`Warning: brain unavailable — ${candidate.id} kept pending`, 'error');
          }
        } else {
          rejectCandidate(ctx.cwd, taskId, candidate.id);
          emitPolicyDecision(ctx.cwd, sid, {
            taskId,
            subjectType: 'memory_write',
            subjectName: candidate.id,
            actionRequested: 'write to brain (orphan recovery)',
            decision: 'rejected',
            reasonCode: 'human_rejected_recovery',
            reason: 'user rejected orphaned memory candidate',
            approvedBy: 'none',
            memoryCandidateRefs: [candidate.id],
            source: 'memory_staging',
          });
          dropped++;
        }
      }
      ctx.ui.notify(`Memory recovery done — kept ${kept}, dropped ${dropped}.`, 'info');
    },
  });
}
