import { randomUUID } from 'node:crypto';
import { runReview } from '../../ccp/commands/review';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('review', {
    description: 'Human review of completed work (AWAITING_HUMAN_REVIEW). Usage: /review [task-id]',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task in AWAITING_HUMAN_REVIEW. Run /verify first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'reviewing…');
      if (ctx.hasUI) ctx.ui.notify(narrate('review', 'awaiting human review'), 'info');
      try {
        const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { status } = await runReview({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui: makePiUiAdapter(ctx.ui),
        });
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('review', `task ${status}`),
            status === 'FAIL' || status === 'BLOCKED' ? 'error' : 'info',
          );
          ctx.ui.notify(
            narrate('phase', status === 'PASS' || status === 'PASS_WITH_DEGRADATION' ? 'AWAITING_HUMAN_REVIEW → EVALUATING' : 'AWAITING_HUMAN_REVIEW → VERIFYING'),
            'info',
          );
        }
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          status === 'PASS' || status === 'PASS_WITH_DEGRADATION'
            ? `Review ${status}. Run /evaluate to score the task.`
            : `Review ${status}. Fix issues and run /verify again.`,
          status === 'FAIL' || status === 'BLOCKED' ? 'error' : 'info',
        );
        await session.runPackValidators(ctx.cwd, verifySessionId, 'review', 'review', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/review failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
