import { listPendingCandidates } from '../../ccp/commands/shared/memory-staging';
import { runStatus } from '../../ccp/commands/status';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('status', {
    description: 'Show current Agent OS task status and Black Box health',
    handler: async (args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      const taskIdArg = args.match(/T-\d{3}/)?.[0];
      const sessionIdArg = args.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )?.[0];
      const status = await runStatus({
        repoRoot: ctx.cwd,
        taskId: taskIdArg ?? undefined,
        sessionId: sessionIdArg ?? undefined,
        render: true,
      });
      if (status) {
        const taskId = status.task_id;
        let memLine = '';
        try {
          const pending = listPendingCandidates(ctx.cwd, taskId);
          if (pending.length > 0)
            memLine = `\n${pending.length} memory candidate(s) pending — run /memory ${taskId} to resume`;
        } catch {
          /* best-effort */
        }
        ctx.ui.notify(
          `${taskId} · ${status.current_state}\nnext: ${status.next_action}${memLine}`,
          'info',
        );
        session.refreshStatusBar(ctx.cwd, taskId, ctx);
      } else {
        ctx.ui.notify('No active task. Run /init if this project is not yet initialized.', 'info');
      }
    },
  });
}
