import { randomUUID } from 'node:crypto';
import { runGrill } from '../../ccp/commands/grill';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('grill', {
    description: 'Start a new task. Usage: /grill <goal>',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify('/grill requires a goal. Example: /grill add dark mode toggle', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'grilling…');
      try {
        const { generator, sourceDocs } = session.buildGrillGenerator(ctx.cwd, ctx);
        const { taskId } = await runGrill({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          goal,
          userType: 'non_developer',
          ui: makePiUiAdapter(ctx.ui),
          generator,
          sourceDocs,
        });
        if (ctx.hasUI) ctx.ui.notify(narrate('phase', 'entered SHARED_UNDERSTANDING'), 'info');
        session.refreshStatusBar(ctx.cwd, taskId, ctx);
        ctx.ui.notify(`Task ${taskId} created. Run /plan to draft the plan.`, 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/grill failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
