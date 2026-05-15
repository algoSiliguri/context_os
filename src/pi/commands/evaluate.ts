import { randomUUID } from 'node:crypto';
import { runEvaluate } from '../../ccp/commands/evaluate';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('evaluate', {
    description: 'Score task outcome (runs after /review). Usage: /evaluate [task-id]',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /review first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'evaluating…');
      if (ctx.hasUI) ctx.ui.notify(narrate('evaluate', 'evaluating task outcome'), 'info');
      try {
        const evalSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const { taskOutcome, criteriaSatisfactionRate } = await runEvaluate({
          repoRoot: ctx.cwd,
          sessionId: evalSessionId,
          taskId,
          ui: makePiUiAdapter(ctx.ui),
        });
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('evaluate', `outcome: ${taskOutcome} (criteria=${criteriaSatisfactionRate})`),
            taskOutcome === 'FAIL' ? 'error' : 'info',
          );
          ctx.ui.notify(
            narrate('phase', taskOutcome !== 'FAIL' ? 'EVALUATING → PERSISTING_KNOWLEDGE' : 'EVALUATING → FAILED_RECOVERABLE'),
            'info',
          );
        }
        ctx.ui.setStatus('agent-os', undefined);
        const pct = Math.round(criteriaSatisfactionRate * 100);
        ctx.ui.notify(
          taskOutcome !== 'FAIL'
            ? `Evaluation: ${taskOutcome} (${pct}% criteria). Run /remember to save learnings.`
            : `Evaluation: FAIL (${pct}% criteria). Fix and restart.`,
          taskOutcome === 'FAIL' ? 'error' : 'info',
        );
        await session.runPackValidators(ctx.cwd, evalSessionId, 'evaluate', 'evaluation', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/evaluate failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
