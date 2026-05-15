import { randomUUID } from 'node:crypto';
import { runRun } from '../../ccp/commands/run';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { createCheckpoint, restoreCheckpoint } from '../../ccp/commands/shared/git-checkpoint';
import { emitPolicyDecision } from '../../ccp/commands/shared/policy-decision-writer';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import { makeNarratingExecutor } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('run', {
    description: 'Record plan execution. Usage: /run [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Run /grill first.', 'error');
        return;
      }
      ctx.ui.setStatus('agent-os', 'running…');
      try {
        const runSid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
        const ckpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
        if (ckpt.noGit) {
          ctx.ui.notify('Warning: not a git repo — no checkpoint created. Proceeding.', 'info');
          emitPolicyDecision(ctx.cwd, runSid, {
            taskId,
            subjectType: 'sandbox',
            subjectName: 'git-checkpoint',
            actionRequested: 'stash dirty files',
            decision: 'block',
            reasonCode: 'no_git',
            reason: 'not a git repo — checkpoint skipped',
            source: 'checkpoint',
          });
        } else if (ckpt.created) {
          ctx.ui.notify(
            `Checkpoint: stashed ${ckpt.dirtyFiles.length} file(s). Will restore on failure.`,
            'info',
          );
          emitPolicyDecision(ctx.cwd, runSid, {
            taskId,
            subjectType: 'sandbox',
            subjectName: 'git-checkpoint',
            actionRequested: 'stash dirty files',
            decision: 'allow',
            reasonCode: 'checkpoint_created',
            reason: `stashed ${ckpt.dirtyFiles.length} file(s) (sha: ${ckpt.sha ?? 'n/a'})`,
            source: 'checkpoint',
          });
        }

        const { outcome } = await runRun({
          repoRoot: ctx.cwd,
          sessionId: runSid,
          taskId,
          executor: makeNarratingExecutor(ctx.cwd, ctx, taskId),
        });
        if (ctx.hasUI) {
          const runToState =
            outcome === 'verifying'
              ? 'VERIFYING'
              : outcome === 'failed_recoverable'
                ? 'FAILED_RECOVERABLE'
                : 'FAILED_BLOCKED';
          ctx.ui.notify(narrate('phase', `entered ${runToState}`), 'info');
        }
        session.refreshStatusBar(ctx.cwd, taskId, ctx);
        if (outcome !== 'verifying' && ckpt.created) {
          const restore = await restoreCheckpoint(ctx.cwd);
          if (restore.restored) {
            ctx.ui.notify('Checkpoint restored — pre-run changes are back.', 'info');
            emitPolicyDecision(ctx.cwd, runSid, {
              taskId,
              subjectType: 'sandbox',
              subjectName: 'git-checkpoint',
              actionRequested: 'restore stash',
              decision: 'allow',
              reasonCode: 'run_failed_restore',
              reason: `run outcome=${outcome}; pre-run state restored`,
              source: 'checkpoint',
            });
          }
        }
        ctx.ui.notify(
          outcome === 'verifying'
            ? 'Execution recorded. Run /verify to check results.'
            : `/run outcome: ${outcome}. Check /status.`,
          outcome === 'verifying' ? 'info' : 'error',
        );
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        if (typeof taskId === 'string') {
          try {
            await restoreCheckpoint(ctx.cwd);
          } catch {
            /* best-effort */
          }
        }
        ctx.ui.notify(`/run failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
