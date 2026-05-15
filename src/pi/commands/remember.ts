import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { basename } from 'node:path';
import { BrainClient } from '../../ccp/brain/client';
import { runRemember } from '../../ccp/commands/remember';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { listPendingCandidates } from '../../ccp/commands/shared/memory-staging';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import { loadPolicyConfig, makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, _session: PiSession): void {
  pi.registerCommand('remember', {
    description: 'Save task learnings to brain DB. Usage: /remember [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task.', 'error');
        return;
      }
      const config = loadPolicyConfig(ctx.cwd);
      const brain = new BrainClient({
        dbPath: join(ctx.cwd, 'data_store', 'knowledge.db'),
        repoRoot: ctx.cwd,
      });
      ctx.ui.setStatus('agent-os', 'remembering…');
      try {
        const pendingBefore = listPendingCandidates(ctx.cwd, taskId);
        if (pendingBefore.length > 0 && ctx.hasUI) {
          ctx.ui.notify(
            narrate('memory', `${pendingBefore.length} candidate${pendingBefore.length === 1 ? '' : 's'} pending approval`),
            'info',
          );
        }

        const { kept, dropped } = await runRemember({
          repoRoot: ctx.cwd,
          sessionId: loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID(),
          taskId,
          brain,
          ui: makePiUiAdapter(ctx.ui),
          projectName: (config as any).project_id ?? basename(ctx.cwd),
        });

        const total = kept + dropped;
        if (ctx.hasUI && total > 0) {
          ctx.ui.notify(
            narrate('memory', `${kept} candidate${kept === 1 ? '' : 's'} approved, ${dropped} declined`),
            'info',
          );
        }
        if (ctx.hasUI) ctx.ui.notify(narrate('phase', 'PERSISTING_KNOWLEDGE → COMPLETED'), 'info');
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`Done — kept ${kept}, dropped ${dropped}. Task complete.`, 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/remember failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
