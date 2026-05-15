import { randomUUID } from 'node:crypto';
import { runEvaluate } from '../../ccp/commands/evaluate';
import { runGrill } from '../../ccp/commands/grill';
import { runPlan } from '../../ccp/commands/plan';
import { runReview } from '../../ccp/commands/review';
import { runRun } from '../../ccp/commands/run';
import { runVerify } from '../../ccp/commands/verify';
import { createCheckpoint, restoreCheckpoint } from '../../ccp/commands/shared/git-checkpoint';
import { makeShellCommandRunner } from '../../ccp/commands/shared/command-runner';
import { loadTaskSessionId } from '../../ccp/commands/shared/task-loader';
import { narrate } from '../../core/narrator';
import { loadPolicyConfig, makePiUiAdapter, makeNarratingExecutor } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('flow', {
    description: 'Run full governed task lifecycle. Usage: /flow <goal>',
    handler: async (args: string, ctx: any) => {
      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify(
          '/flow requires a goal. Example: /flow add pagination to users list',
          'error',
        );
        return;
      }
      const ui = makePiUiAdapter(ctx.ui);
      loadPolicyConfig(ctx.cwd);

      // ── grill ──
      ctx.ui.setStatus('agent-os', 'flow: grilling…');
      const { generator: grillGen, sourceDocs: grillDocs } = session.buildGrillGenerator(ctx.cwd, ctx);
      let taskId: string;
      try {
        ({ taskId } = await runGrill({
          repoRoot: ctx.cwd,
          sessionId: randomUUID(),
          goal,
          userType: 'non_developer',
          ui,
          generator: grillGen,
          sourceDocs: grillDocs,
        }));
        if (ctx.hasUI) ctx.ui.notify(narrate('phase', 'entered SHARED_UNDERSTANDING'), 'info');
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at grill: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);
      const proceedWithPlan = await ui.confirm(`${taskId}: grill done. Proceed with /plan?`);
      if (!proceedWithPlan) {
        ctx.ui.notify('/flow paused after grill. Run /plan when ready.', 'info');
        return;
      }

      // ── plan ──
      ctx.ui.setStatus('agent-os', 'flow: planning…');
      const planSessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      let planOutcome: string;
      try {
        ({ outcome: planOutcome } = await runPlan({
          repoRoot: ctx.cwd,
          sessionId: planSessionId,
          taskId,
          ui,
          drafter: session.buildPlanDrafter(),
        }));
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', planOutcome === 'approved' ? 'entered AWAITING_PLAN_APPROVAL' : 'AWAITING_PLAN_APPROVAL → SHARED_UNDERSTANDING'),
            'info',
          );
        }
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at plan: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);
      if (planOutcome !== 'approved') {
        ctx.ui.notify(
          '/flow paused — plan not approved. Refine and run /plan, then /flow resume.',
          'info',
        );
        return;
      }
      const proceedWithRun = await ui.confirm(`${taskId}: plan approved. Proceed with /run?`);
      if (!proceedWithRun) {
        ctx.ui.notify('/flow paused after plan. Run /run when ready.', 'info');
        return;
      }

      // ── run ──
      ctx.ui.setStatus('agent-os', 'flow: running…');
      const flowCkpt = await createCheckpoint(ctx.cwd, `agent-os-checkpoint: ${taskId}`);
      if (!flowCkpt.noGit && flowCkpt.created) {
        ctx.ui.notify(
          `Checkpoint: stashed ${flowCkpt.dirtyFiles.length} file(s) before run.`,
          'info',
        );
      }
      let runOutcome: string;
      try {
        ({ outcome: runOutcome } = await runRun({
          repoRoot: ctx.cwd,
          sessionId: loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID(),
          taskId,
          executor: makeNarratingExecutor(ctx.cwd, ctx, taskId),
        }));
        if (ctx.hasUI) {
          const flowRunToState =
            runOutcome === 'verifying'
              ? 'VERIFYING'
              : runOutcome === 'failed_recoverable'
                ? 'FAILED_RECOVERABLE'
                : 'FAILED_BLOCKED';
          ctx.ui.notify(narrate('phase', `entered ${flowRunToState}`), 'info');
        }
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        if (flowCkpt.created) {
          try { await restoreCheckpoint(ctx.cwd); } catch { /* best-effort */ }
        }
        ctx.ui.notify(`/flow stopped at run: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);
      if (runOutcome !== 'verifying') {
        if (flowCkpt.created) {
          const r = await restoreCheckpoint(ctx.cwd);
          if (r.restored) ctx.ui.notify('Checkpoint restored — pre-run changes are back.', 'info');
        }
        ctx.ui.notify(
          `/flow stopped — /run outcome: ${runOutcome}. Fix and /run --resume.`,
          'error',
        );
        return;
      }

      // ── verify ──
      ctx.ui.setStatus('agent-os', 'flow: verifying…');
      let verifyResult: string;
      const verifySessionId = loadTaskSessionId(ctx.cwd, taskId) ?? randomUUID();
      try {
        ({ result: verifyResult } = await runVerify({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          runner: makeShellCommandRunner({ cwd: ctx.cwd }),
        }));
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', verifyResult === 'pass' ? 'entered AWAITING_HUMAN_REVIEW' : 'VERIFYING → FAILED_RECOVERABLE'),
            'info',
          );
        }
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at verify: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);
      if (verifyResult !== 'pass') {
        ctx.ui.notify(
          `/flow stopped — verification: ${verifyResult}. Fix and run /verify.`,
          'error',
        );
        return;
      }

      // ── review ──
      ctx.ui.setStatus('agent-os', 'flow: reviewing…');
      let reviewStatus: string;
      try {
        ({ status: reviewStatus } = await runReview({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui,
        }));
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', reviewStatus === 'PASS' || reviewStatus === 'PASS_WITH_DEGRADATION' ? 'AWAITING_HUMAN_REVIEW → EVALUATING' : 'AWAITING_HUMAN_REVIEW → VERIFYING'),
            'info',
          );
        }
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at review: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);
      if (reviewStatus === 'FAIL' || reviewStatus === 'BLOCKED') {
        ctx.ui.notify(
          `/flow stopped — review: ${reviewStatus}. Fix and run /verify again.`,
          'error',
        );
        return;
      }

      // ── evaluate ──
      ctx.ui.setStatus('agent-os', 'flow: evaluating…');
      let taskOutcome: string;
      try {
        ({ taskOutcome } = await runEvaluate({
          repoRoot: ctx.cwd,
          sessionId: verifySessionId,
          taskId,
          ui,
        }));
        if (ctx.hasUI) {
          ctx.ui.notify(
            narrate('phase', taskOutcome !== 'FAIL' ? 'EVALUATING → PERSISTING_KNOWLEDGE' : 'EVALUATING → FAILED_RECOVERABLE'),
            'info',
          );
        }
      } catch (e) {
        ctx.ui.setStatus('agent-os', undefined);
        ctx.ui.notify(`/flow stopped at evaluate: ${(e as Error).message}`, 'error');
        return;
      }
      session.refreshStatusBar(ctx.cwd, taskId, ctx);

      ctx.ui.notify(
        taskOutcome !== 'FAIL'
          ? `Flow complete. ${taskId} evaluated: ${taskOutcome}. Run /remember to save learnings.`
          : 'Flow complete with FAIL evaluation. Review and decide whether to retry.',
        taskOutcome === 'FAIL' ? 'error' : 'info',
      );
    },
  });
}
