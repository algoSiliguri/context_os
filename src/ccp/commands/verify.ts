import { emitAndProject } from '../../core/projector';
import { makeEnvelope } from '../artifacts/envelope';
import { readArtifact, writeArtifact } from '../artifacts/io';
import {
  buildTaskStateTransitionEvent,
  buildVerificationFailedEvent,
  buildVerificationPassedEvent,
  buildVerificationStartedEvent,
} from '../ccp-events';
import { compressOutput } from './shared/compressed-output';
import { requireTaskState, writeTaskState } from './shared/task-loader';

export interface VerificationRunner {
  runCommand(cmd: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface VerifyArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  runner: VerificationRunner;
}

export type VerifyResult = 'pass' | 'fail' | 'blocked';

export async function runVerify(args: VerifyArgs): Promise<{ result: VerifyResult }> {
  const currentState = requireTaskState(args.repoRoot, args.taskId, [
    'VERIFYING',
    'AWAITING_HUMAN_REVIEW',
    'FAILED_RECOVERABLE',
  ]);
  if (currentState !== 'VERIFYING') {
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildTaskStateTransitionEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        from: currentState,
        to: 'VERIFYING',
        triggeredBy: '/verify',
      }),
    );
    writeTaskState(args.repoRoot, args.taskId, 'VERIFYING');
  }
  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildVerificationStartedEvent({ sessionId: args.sessionId, taskId: args.taskId }),
  );

  const plan = readArtifact(args.repoRoot, args.taskId, 'plan') as unknown as {
    steps: Array<{ verification: Array<{ command: string; expected_signal: string }> }>;
  };
  const allCommands = plan.steps.flatMap((s) => s.verification);

  const ranCommands: Array<{
    command: string;
    run_at: string;
    exit_code: number;
    summary: string;
    raw_output_ref?: string;
  }> = [];
  let firstFail: { command: string; summary: string } | null = null;

  for (const v of allCommands) {
    const out = await args.runner.runCommand(v.command);
    const ts = new Date().toISOString();
    const compressed = compressOutput({
      repoRoot: args.repoRoot,
      taskId: args.taskId,
      stdout: out.stdout,
      stderr: out.stderr,
      command: v.command,
    });
    ranCommands.push({
      command: v.command,
      run_at: ts,
      exit_code: out.exitCode,
      summary: compressed.summary,
      raw_output_ref: compressed.rawOutputRef,
    });
    if (out.exitCode !== 0) {
      firstFail = { command: v.command, summary: compressed.summary };
      break;
    }
  }

  const result: VerifyResult = firstFail === null ? 'pass' : 'fail';
  const next_action = firstFail ? `fix ${firstFail.command} — ${firstFail.summary}` : null;

  const env = makeEnvelope({ taskId: args.taskId, artifactType: 'VerificationRecord' });
  writeArtifact(args.repoRoot, args.taskId, 'verification', {
    ...env,
    artifact_type: 'VerificationRecord',
    commands: ranCommands,
    result,
    next_action,
  });

  if (result === 'pass') {
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildVerificationPassedEvent({ sessionId: args.sessionId, taskId: args.taskId }),
    );
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildTaskStateTransitionEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        from: 'VERIFYING',
        to: 'AWAITING_HUMAN_REVIEW',
        triggeredBy: '/verify (pass)',
      }),
    );
    writeTaskState(args.repoRoot, args.taskId, 'AWAITING_HUMAN_REVIEW');
  } else {
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildVerificationFailedEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        summary: firstFail?.summary ?? 'verification failed',
        nextAction: next_action ?? 'fix and re-run',
      }),
    );
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildTaskStateTransitionEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        from: 'VERIFYING',
        to: 'FAILED_RECOVERABLE',
        triggeredBy: '/verify (fail)',
      }),
    );
    writeTaskState(args.repoRoot, args.taskId, 'FAILED_RECOVERABLE');
  }

  return { result };
}
