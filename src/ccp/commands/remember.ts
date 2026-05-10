import { join } from 'node:path';
import { readEvents } from '../../core/event-log';
import { emitAndProject } from '../../core/projector';
import { sessionEventsPath } from '../../core/runtime-paths';
import type { UiAdapter } from '../../pi/ui';
import { makeEnvelope } from '../artifacts/envelope';
import { writeArtifact } from '../artifacts/io';
import type { BrainClient } from '../brain/client';
import {
  buildKnowledgeCaptureApprovedEvent,
  buildKnowledgeCaptureProposedEvent,
  buildKnowledgeCaptureRejectedEvent,
  buildTaskCompletedEvent,
  buildTaskStateTransitionEvent,
} from '../ccp-events';
import {
  type CaptureProposal,
  type CaptureProposer,
  defaultCaptureProposer,
} from './shared/capture-proposer';
import { requireTaskState, writeTaskState } from './shared/task-loader';

export interface RememberArgs {
  repoRoot: string;
  sessionId: string;
  taskId: string;
  brain: BrainClient;
  ui: UiAdapter;
  projectName: string;
  log?: (msg: string) => void;
  proposer?: CaptureProposer;
}

export async function runRemember(args: RememberArgs): Promise<{ kept: number; dropped: number }> {
  requireTaskState(args.repoRoot, args.taskId, ['AWAITING_HUMAN_REVIEW']);

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      from: 'AWAITING_HUMAN_REVIEW',
      to: 'PERSISTING_KNOWLEDGE',
      triggeredBy: '/remember',
    }),
  );
  writeTaskState(args.repoRoot, args.taskId, 'PERSISTING_KNOWLEDGE');

  const proposer = args.proposer ?? defaultCaptureProposer();
  const eventsLog = sessionEventsPath(args.repoRoot, args.sessionId);
  const allEvents = readEvents(eventsLog).filter(
    (e) => (e.payload as Record<string, unknown>).task_id === args.taskId,
  );
  const proposals = await proposer.propose({ taskId: args.taskId, events: allEvents });

  let kept = 0;
  let dropped = 0;
  const items: Array<{
    id: string;
    scope: 'session' | 'project' | 'global';
    type: CaptureProposal['type'];
    text: string;
    evidence: string;
    approval: 'pending' | 'approved' | 'rejected';
    brain_status?: 'written' | 'deferred';
    brain_node_id?: string;
  }> = [];

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]!;
    const captureId = `K-${i + 1}`;
    emitAndProject(
      args.repoRoot,
      args.sessionId,
      buildKnowledgeCaptureProposedEvent({
        sessionId: args.sessionId,
        taskId: args.taskId,
        captureId,
        captureType: p.type,
      }),
    );

    const keep = await args.ui.confirm(
      `[capture ${i + 1}/${proposals.length}] type=${p.type} scope=${p.scope}\n  ${p.text}\n  Keep?`,
    );

    if (keep) {
      const result = await args.brain.write({
        content: p.text,
        type: p.type,
        scope: p.scope,
        taskId: args.taskId,
        project: args.projectName,
      });
      emitAndProject(
        args.repoRoot,
        args.sessionId,
        buildKnowledgeCaptureApprovedEvent({
          sessionId: args.sessionId,
          taskId: args.taskId,
          captureId,
          brainNodeId: result.id ?? 'deferred',
        }),
      );
      items.push({
        id: captureId,
        scope: p.scope,
        type: p.type,
        text: p.text,
        evidence: p.evidence,
        approval: 'approved',
        brain_status: result.deferred ? 'deferred' : 'written',
        ...(result.id ? { brain_node_id: result.id } : {}),
      });
      kept++;
    } else {
      emitAndProject(
        args.repoRoot,
        args.sessionId,
        buildKnowledgeCaptureRejectedEvent({
          sessionId: args.sessionId,
          taskId: args.taskId,
          captureId,
        }),
      );
      items.push({
        id: captureId,
        scope: p.scope,
        type: p.type,
        text: p.text,
        evidence: p.evidence,
        approval: 'rejected',
      });
      dropped++;
    }
  }

  const env = makeEnvelope({ taskId: args.taskId, artifactType: 'KnowledgeCaptureRecord' });
  writeArtifact(args.repoRoot, args.taskId, 'knowledge', {
    ...env,
    artifact_type: 'KnowledgeCaptureRecord',
    items,
  });

  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskStateTransitionEvent({
      sessionId: args.sessionId,
      taskId: args.taskId,
      from: 'PERSISTING_KNOWLEDGE',
      to: 'COMPLETED',
      triggeredBy: '/remember (done)',
    }),
  );
  writeTaskState(args.repoRoot, args.taskId, 'COMPLETED');
  emitAndProject(
    args.repoRoot,
    args.sessionId,
    buildTaskCompletedEvent({ sessionId: args.sessionId, taskId: args.taskId }),
  );

  if (kept > 0) {
    const jsonlPath = join(args.repoRoot, 'data_store', 'knowledge.jsonl');
    try {
      await args.brain.export(jsonlPath);
    } catch (e) {
      args.log?.(
        `agent-os: auto-export to ${jsonlPath} failed: ${(e as Error).message}. Run scripts/sync.sh export before committing.`,
      );
    }
  }

  return { kept, dropped };
}
