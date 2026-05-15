import { randomUUID } from 'node:crypto';
import { runVerify } from '../../ccp/commands/verify';
import { readArtifact } from '../../ccp/artifacts/io';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { makeShellCommandRunner } from '../../ccp/commands/shared/command-runner';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('verify', {
    description: 'Run verification checks. Usage: /verify [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task.', 'error');
        return;
      }
      session.ensurePacksLoaded(ctx.cwd, ctx);
      ctx.ui.setStatus('agent-os', 'verifying…');
      try {
        const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        if (ctx.hasUI) {
          try {
            const planForVerify = readArtifact(ctx.cwd, taskId, 'plan') as unknown as {
              steps: Array<{ verification: Array<{ command: string }> }>;
            };
            const verifyCommandCount = planForVerify.steps.flatMap((s) => s.verification).length;
            ctx.ui.notify(
              narrate('verify', `running ${verifyCommandCount} verification command${verifyCommandCount === 1 ? '' : 's'}`),
              'info',
            );
          } catch {
            /* plan may not be readable — skip count narration */
          }
        }
        const { result } = await runVerify({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          runner: makeShellCommandRunner({ cwd: ctx.cwd }),
        });
        if (ctx.hasUI) {
          try {
            const verRec = readArtifact(ctx.cwd, taskId, 'verification') as unknown as {
              commands: Array<{ exit_code: number }>;
              result: string;
            };
            const passed = verRec.commands.filter((c) => c.exit_code === 0).length;
            const failed = verRec.commands.filter((c) => c.exit_code !== 0).length;
            ctx.ui.notify(
              narrate('verify', `${passed} passed, ${failed} failed`),
              failed > 0 ? 'error' : 'info',
            );
          } catch {
            /* verification record may not be readable — skip summary narration */
          }
        }
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', result === 'pass' ? 'entered AWAITING_HUMAN_REVIEW' : 'VERIFYING → FAILED_RECOVERABLE'),
            'info',
          );
        }
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(
          result === 'pass'
            ? 'Verification passed. Run /remember to save learnings.'
            : 'Verification failed. Fix and run /verify again.',
          result === 'pass' ? 'info' : 'error',
        );
        await session.runPackValidators(ctx.cwd, verifySessionId, 'verify', 'verification', taskId, ctx);
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/verify failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
