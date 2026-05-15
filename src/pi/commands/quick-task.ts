import { randomUUID } from 'node:crypto';
import { runQuickTask } from '../../ccp/commands/quick-task';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('quick-task', {
    description: 'Record a small change (escape hatch). Usage: /quick-task <summary>',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const taskSummary = args.trim();
      if (!taskSummary) {
        ctx.ui.notify(
          '/quick-task requires a summary. Example: /quick-task fix typo in README',
          'error',
        );
        return;
      }
      ctx.ui.setStatus('agent-os', 'quick-task…');
      try {
        const { taskId, status } = await runQuickTask({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          taskSummary,
          ui: makePiUiAdapter(ctx.ui),
        });
        if (ctx.hasUI) {
          const qtToState =
            status === 'ESCALATED_TO_FULL_WORKFLOW'
              ? 'ABORTED'
              : status === 'PASS_QUICK'
                ? 'AWAITING_HUMAN_REVIEW'
                : 'FAILED_RECOVERABLE';
          ctx.ui.notify(narrate('phase', `entered ${qtToState}`), 'info');
        }
        ctx.ui.setStatus('agent-os', undefined);
        const msg =
          status === 'ESCALATED_TO_FULL_WORKFLOW'
            ? `${taskId} escalated — use /grill to start full workflow.`
            : status === 'PASS_QUICK'
              ? `${taskId} done. Run /review to confirm.`
              : `${taskId} failed — fix and run /quick-task again.`;
        ctx.ui.notify(msg, status === 'FAIL' ? 'error' : 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/quick-task failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
