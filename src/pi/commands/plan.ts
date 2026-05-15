import { randomUUID } from 'node:crypto';
import { runPlan } from '../../ccp/commands/plan';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import type { DraftedPlan } from '../../ccp/commands/shared/plan-drafter';
import { narrate } from '../../core/narrator';
import { makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('plan', {
    description: 'Draft a plan for the current task. Usage: /plan [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /grill <goal> first.', 'error');
        return;
      }
      session.ensurePacksLoaded(ctx.cwd, ctx);
      ctx.ui.setStatus('agent-os', 'planning…');
      try {
        const planSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        let capturedDraft: DraftedPlan | undefined;
        const baseDrafter = session.buildPlanDrafter();
        const capturingDrafter = {
          async draft(input: Parameters<typeof baseDrafter.draft>[0]): Promise<DraftedPlan> {
            const result = await baseDrafter.draft(input);
            capturedDraft = result;
            return result;
          },
        };
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('plan', session.planConfig?.verification_profile === 'detected' ? 'drafting plan (verification: detected)' : 'drafting plan'),
            'info',
          );
        }
        const { outcome } = await runPlan({
          repoRoot: ctx.cwd,
          sessionId: planSessionId,
          taskId,
          ui: makePiUiAdapter(ctx.ui),
          drafter: capturingDrafter,
        });
        if (ctx.hasUI && capturedDraft?.detectedCommands && capturedDraft.detectedCommands.length > 0) {
          const first = capturedDraft.detectedCommands[0];
          if (first) {
            ctx.ui.notify(
              narrate('plan', `detected verification: ${first.command} (${first.source_file})`),
              'info',
            );
          }
        }
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', outcome === 'approved' ? 'entered AWAITING_PLAN_APPROVAL' : 'AWAITING_PLAN_APPROVAL → SHARED_UNDERSTANDING'),
            'info',
          );
        }
        session.refreshStatusBar(ctx.cwd, taskId, ctx);
        if (outcome === 'approved') {
          ctx.ui.notify(
            `Plan approved. Edit .agent-os/tasks/${taskId}/plan.yaml to add commands if needed, then run /run.`,
            'info',
          );
        } else {
          ctx.ui.notify(
            `Plan rejected. Edit .agent-os/tasks/${taskId}/plan.yaml and run /plan again.`,
            'info',
          );
        }
        await session.runPackValidators(ctx.cwd, planSessionId, 'write-plan', 'plan', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/plan failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
