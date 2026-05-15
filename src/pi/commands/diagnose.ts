import { randomUUID } from 'node:crypto';
import { runDiagnose } from '../../ccp/commands/diagnose';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('diagnose', {
    description: 'Start a bugfix task with structured diagnosis. Usage: /diagnose <bug summary>',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const bugSummary = args.trim();
      if (!bugSummary) {
        ctx.ui.notify(
          '/diagnose requires a bug summary. Example: /diagnose login fails on Safari',
          'error',
        );
        return;
      }
      ctx.ui.setStatus('agent-os', 'diagnosing…');
      try {
        const { taskId, decision } = await runDiagnose({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          bugSummary,
          ui: makePiUiAdapter(ctx.ui),
          phasedConfig: session.diagnoseConfig,
        });
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', decision === 'proceed' ? 'DIAGNOSING → SHARED_UNDERSTANDING' : 'DIAGNOSING → FAILED_BLOCKED'),
            'info',
          );
        }
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          decision === 'proceed'
            ? `${taskId} diagnosed. Run /plan to draft fix plan.`
            : `${taskId} diagnosis blocked — open blockers recorded. Fix blockers first.`,
          decision === 'proceed' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/diagnose failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
