import { randomUUID } from 'node:crypto';
import { runEvaluate } from '../../ccp/commands/evaluate';
import { runPlan } from '../../ccp/commands/plan';
import { runReview } from '../../ccp/commands/review';
import { runRun } from '../../ccp/commands/run';
import { runVerify } from '../../ccp/commands/verify';
import { createCheckpoint, restoreCheckpoint } from '../../ccp/commands/shared/git-checkpoint';
import { makeShellCommandRunner } from '../../ccp/commands/shared/command-runner';
import { getCurrentTaskId } from '../../ccp/commands/shared/current-task';
import { loadTaskSessionId, loadTaskState } from '../../ccp/commands/shared/task-loader';
import { loadPolicyConfig, makePiUiAdapter, makeNarratingExecutor } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('continue', {
    description: 'Resume a task from current state. Usage: /continue [task-id]',
    handler: async (args: string, ctx: any) => {
      const taskId = args.match(/T-\d{3}/)?.[0] ?? getCurrentTaskId(ctx.cwd);
      if (!taskId) {
        ctx.ui.notify('No active task. Start one with /grill or /flow.', 'error');
        return;
      }
      const state = loadTaskState(ctx.cwd, taskId);
      if (!state) {
        ctx.ui.notify(`Task ${taskId} has no state. Run /status to investigate.`, 'error');
        return;
      }
      const sid = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      const ui = makePiUiAdapter(ctx.ui);
      loadPolicyConfig(ctx.cwd);

      switch (state) {
        case 'SHARED_UNDERSTANDING': {
          ctx.ui.notify(`${taskId} is in SHARED_UNDERSTANDING — running /plan`, 'info');
          try {
            const { outcome } = await runPlan({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              ui,
              drafter: session.buildPlanDrafter(),
            });
            session.refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              outcome === 'approved'
                ? 'Plan approved. Run /continue to proceed.'
                : 'Plan rejected. Refine and /continue.',
              outcome === 'approved' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (plan) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'AWAITING_PLAN_APPROVAL':
        case 'FAILED_RECOVERABLE': {
          ctx.ui.notify(`${taskId} is in ${state} — running /run`, 'info');
          try {
            const ckpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
            if (ckpt.created)
              ctx.ui.notify(`Checkpoint: stashed ${ckpt.dirtyFiles.length} file(s).`, 'info');
            const { outcome } = await runRun({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              executor: makeNarratingExecutor(ctx.cwd, ctx, taskId),
              resume: state === 'FAILED_RECOVERABLE',
            });
            session.refreshStatusBar(ctx.cwd, taskId, ctx);
            if (outcome !== 'verifying' && ckpt.created) {
              const r = await restoreCheckpoint(ctx.cwd);
              if (r.restored) ctx.ui.notify('Checkpoint restored.', 'info');
            }
            ctx.ui.notify(
              outcome === 'verifying'
                ? 'Run complete. /continue to verify.'
                : `Run ${outcome}. Fix and /continue.`,
              outcome === 'verifying' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (run) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'VERIFYING': {
          ctx.ui.notify(`${taskId} is in VERIFYING — running /verify`, 'info');
          try {
            const { result } = await runVerify({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              runner: makeShellCommandRunner({ cwd: ctx.cwd }),
            });
            session.refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              result === 'pass'
                ? 'Verified. /continue to review.'
                : `Verify ${result}. Fix and /continue.`,
              result === 'pass' ? 'info' : 'error',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (verify) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'AWAITING_HUMAN_REVIEW': {
          ctx.ui.notify(`${taskId} is in AWAITING_HUMAN_REVIEW — running /review`, 'info');
          try {
            const { status } = await runReview({ repoRoot: ctx.cwd, sessionId: sid, taskId, ui });
            session.refreshStatusBar(ctx.cwd, taskId, ctx);
            ctx.ui.notify(
              status === 'PASS' || status === 'PASS_WITH_DEGRADATION'
                ? `Review ${status}. /continue to evaluate.`
                : `Review ${status}. Fix and /continue.`,
              status === 'FAIL' || status === 'BLOCKED' ? 'error' : 'info',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (review) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'EVALUATING': {
          ctx.ui.notify(`${taskId} is in EVALUATING — running /evaluate`, 'info');
          try {
            const { taskOutcome, criteriaSatisfactionRate } = await runEvaluate({
              repoRoot: ctx.cwd,
              sessionId: sid,
              taskId,
              ui,
            });
            session.refreshStatusBar(ctx.cwd, taskId, ctx);
            const pct = Math.round(criteriaSatisfactionRate * 100);
            ctx.ui.notify(
              `Evaluation: ${taskOutcome} (${pct}%). Run /remember to save learnings.`,
              taskOutcome === 'FAIL' ? 'error' : 'info',
            );
          } catch (e) {
            ctx.ui.notify(`/continue (evaluate) failed: ${(e as Error).message}`, 'error');
          }
          break;
        }
        case 'PERSISTING_KNOWLEDGE': {
          ctx.ui.notify(`${taskId} is in PERSISTING_KNOWLEDGE — run /remember to complete`, 'info');
          break;
        }
        case 'DONE':
        case 'TASK_COMPLETE': {
          ctx.ui.notify(`${taskId} is ${state} — nothing to continue.`, 'info');
          break;
        }
        default: {
          ctx.ui.notify(
            `${taskId} is in ${state} — no automatic continuation for this state. Run /status.`,
            'error',
          );
        }
      }
    },
  });
}
