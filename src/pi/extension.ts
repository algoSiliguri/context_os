// src/pi/extension.ts — Pi v0.74.0 compatible
//
// Bootstraps the PiSession, registers all slash commands, and wires
// the tool_call policy handler and session_start event.
// Does NOT import from @earendil-works/pi-coding-agent to avoid a hard
// dependency; `pi` is typed as `any`.

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentTaskId } from '../ccp/commands/shared/current-task';
import { listPendingCandidates } from '../ccp/commands/shared/memory-staging';
import { loadTaskSessionId, loadTaskState } from '../ccp/commands/shared/task-loader';
import {
  type SessionApprovalCache,
  decideToolCall,
  recordTier2Approval,
} from '../ccp/policy/decision-flow';
import { ToolRegistry } from '../ccp/policy/tool-registry';
import { emitAndProject } from '../core/projector';
import { buildHeartbeatEvent } from '../core/events';
import { emitPolicyDecision } from '../ccp/commands/shared/policy-decision-writer';
import { loadPolicyConfig } from './extension-helpers';
import { PiSession } from './pi-session';
import * as cmdInit from './commands/init';
import * as cmdDoctor from './commands/doctor';
import * as cmdStatus from './commands/status';
import * as cmdFlight from './commands/flight';
import * as cmdGrill from './commands/grill';
import * as cmdPlan from './commands/plan';
import * as cmdRun from './commands/run';
import * as cmdVerify from './commands/verify';
import * as cmdDiagnose from './commands/diagnose';
import * as cmdQuickTask from './commands/quick-task';
import * as cmdReview from './commands/review';
import * as cmdEvaluate from './commands/evaluate';
import * as cmdRemember from './commands/remember';
import * as cmdFlow from './commands/flow';
import * as cmdMemory from './commands/memory';
import * as cmdContinue from './commands/continue';

function buildPiRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  const base = {
    source: 'pi' as const,
    trust_level: 'trusted' as const,
    network_required: false,
    workspace_required: true,
    audit_metadata: {},
    retry_policy: 'none' as const,
    idempotency_key_support: false,
  };
  for (const id of ['read', 'grep', 'find', 'ls'] as const) {
    r.register({ ...base, tool_id: id, capability_type: 'READ_LOCAL', read_or_write: 'read', approval_tier: 1 });
  }
  for (const id of ['edit', 'write'] as const) {
    r.register({ ...base, tool_id: id, capability_type: 'WRITE_LOCAL', read_or_write: 'write', approval_tier: 2 });
  }
  r.register({ ...base, tool_id: 'bash', capability_type: 'EXECUTE_LOCAL', read_or_write: 'write', approval_tier: 3 });
  return r;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function extension(pi: any): Promise<void> {
  const session = new PiSession(buildPiRegistry(), new Map() as SessionApprovalCache);

  cmdInit.register(pi, session);
  cmdDoctor.register(pi, session);
  cmdStatus.register(pi, session);
  cmdFlight.register(pi, session);
  cmdGrill.register(pi, session);
  cmdPlan.register(pi, session);
  cmdRun.register(pi, session);
  cmdVerify.register(pi, session);
  cmdDiagnose.register(pi, session);
  cmdQuickTask.register(pi, session);
  cmdReview.register(pi, session);
  cmdEvaluate.register(pi, session);
  cmdRemember.register(pi, session);
  cmdFlow.register(pi, session);
  cmdMemory.register(pi, session);
  cmdContinue.register(pi, session);

  // ── tool_call policy ──────────────────────────────────────────────────────
  const WRITE_TOOL_IDS = new Set(['edit', 'write', 'bash']);
  const EXECUTING_STATES = new Set(['EXECUTING']);

  pi.on('tool_call', async (event: any, ctx: any) => {
    const { toolName, input } = event as { toolName: string; input: Record<string, unknown> };
    const config = loadPolicyConfig(ctx.cwd);

    let escalatedConfig = config;
    let escalated = false;
    let escalateTaskId: string | null = null;
    let escalateState: string | null = null;
    if (WRITE_TOOL_IDS.has(toolName)) {
      try {
        escalateTaskId = getCurrentTaskId(ctx.cwd);
        if (escalateTaskId) {
          escalateState = loadTaskState(ctx.cwd, escalateTaskId);
          if (escalateState && !EXECUTING_STATES.has(escalateState)) {
            escalated = true;
            escalatedConfig = {
              ...config,
              overrides: [
                ...(config.overrides ?? []),
                { tool: toolName, when: 'matches ".*"', tier: 3 as const },
              ],
            };
          }
        }
      } catch {
        /* best-effort: fall back to base tier */
      }
    }

    const decision = decideToolCall(
      { toolName, input: input ?? {} },
      { registry: session.registry, cache: session.sessionCache, config: escalatedConfig },
    );

    const auditSessionId = (() => {
      try {
        return (escalateTaskId && loadTaskSessionId(ctx.cwd, escalateTaskId)) || randomUUID();
      } catch {
        return randomUUID();
      }
    })();

    if (decision.outcome === 'pass') return undefined;

    if (decision.outcome === 'block') {
      if (decision.tier === null) {
        const approved = await ctx.ui.confirm(
          'Agent OS — unknown tool',
          `Allow "${toolName}"? It is not in the built-in registry.`,
        );
        emitPolicyDecision(ctx.cwd, auditSessionId, {
          taskId: escalateTaskId ?? undefined,
          phase: escalateState ?? undefined,
          subjectType: 'tool_call',
          subjectName: toolName,
          actionRequested: 'execute',
          decision: approved ? 'approved' : 'rejected',
          reasonCode: 'unknown_tool',
          reason: `tool not in registry; user ${approved ? 'allowed' : 'denied'}`,
          riskTier: null,
          approvedBy: approved ? 'human' : 'none',
          source: 'tool_call',
        });
        return approved
          ? undefined
          : { block: true, reason: `user denied unknown tool: ${toolName}` };
      }
      emitPolicyDecision(ctx.cwd, auditSessionId, {
        taskId: escalateTaskId ?? undefined,
        phase: escalateState ?? undefined,
        subjectType: 'tool_call',
        subjectName: toolName,
        actionRequested: 'execute',
        decision: 'block',
        reasonCode: `tier_${decision.tier ?? 4}_blocked`,
        reason: decision.reason,
        riskTier: decision.tier,
        approvedBy: 'none',
        source: 'tool_call',
      });
      ctx.ui.notify(`Blocked: ${toolName} — ${decision.reason}`, 'error');
      return { block: true, reason: decision.reason };
    }

    // outcome === 'ask'
    const taskId = escalateTaskId ?? getCurrentTaskId(ctx.cwd);
    const state = escalateState ?? (taskId ? loadTaskState(ctx.cwd, taskId) : null);
    const phaseHint = state ? ` [phase: ${state}]` : '';
    if (escalated) {
      emitPolicyDecision(ctx.cwd, auditSessionId, {
        taskId: taskId ?? undefined,
        phase: state ?? undefined,
        subjectType: 'tool_call',
        subjectName: toolName,
        actionRequested: 'execute',
        decision: 'escalate',
        reasonCode: 'write_outside_executing',
        reason: `${toolName} escalated to tier-3 (current phase: ${state})`,
        riskTier: 3,
        approvedBy: 'none',
        source: 'tool_call',
      });
    }
    const approved = await ctx.ui.confirm(
      'Agent OS',
      `${toolName}: ${decision.reason}${phaseHint}`,
    );
    if (decision.cacheKey) recordTier2Approval(session.sessionCache, decision.cacheKey, approved);
    emitPolicyDecision(ctx.cwd, auditSessionId, {
      taskId: taskId ?? undefined,
      phase: state ?? undefined,
      subjectType: 'tool_call',
      subjectName: toolName,
      actionRequested: 'execute',
      decision: approved ? 'approved' : 'rejected',
      reasonCode: approved ? 'human_approved' : 'human_rejected',
      reason: `user ${approved ? 'approved' : 'denied'}: ${decision.reason}`,
      riskTier: decision.tier,
      approvedBy: approved ? 'human' : 'none',
      source: 'tool_call',
    });
    return approved ? undefined : { block: true, reason: `user denied: ${toolName}` };
  });

  // ── session_start ─────────────────────────────────────────────────────────
  pi.on('session_start', (_event: any, ctx: any) => {
    if (ctx.hasUI && !process.env.BRAIN_DB_PATH) {
      ctx.ui.notify(
        'Agent OS: BRAIN_DB_PATH is not set — /remember and /memory will fail. Set: export BRAIN_DB_PATH=$HOME/.knowledge-brain/knowledge.db',
        'error',
      );
    }
    if (ctx.hasUI) {
      const initialized = existsSync(join(ctx.cwd, '.agent-os', 'project.yaml'));
      if (!initialized) {
        ctx.ui.notify(
          'Agent OS active. Project not initialized — run /init to set up, then /doctor.',
          'info',
        );
      } else {
        try {
          const taskId = getCurrentTaskId(ctx.cwd);
          if (taskId) {
            const state = loadTaskState(ctx.cwd, taskId) ?? 'UNKNOWN';
            const pending = listPendingCandidates(ctx.cwd, taskId);
            const memHint =
              pending.length > 0
                ? ` | ${pending.length} memory candidate(s) — /memory ${taskId}`
                : '';
            ctx.ui.notify(
              `Agent OS active. ${taskId} | ${state}${memHint} — /continue to resume, /status for details.`,
              'info',
            );
          } else {
            ctx.ui.notify(
              'Agent OS active. No active task — /flow <goal> to start, /doctor to verify setup.',
              'info',
            );
          }
        } catch {
          ctx.ui.notify('Agent OS active. Run /doctor to check project setup.', 'info');
        }
      }
    }

    setInterval(() => {
      try {
        const taskId = getCurrentTaskId(ctx.cwd);
        if (!taskId) return;
        const sessionId = loadTaskSessionId(ctx.cwd, taskId);
        if (!sessionId) return;
        const state = loadTaskState(ctx.cwd, taskId) ?? 'UNKNOWN';
        emitAndProject(ctx.cwd, sessionId, buildHeartbeatEvent({ sessionId, state }));
      } catch {
        /* heartbeat is best-effort */
      }
    }, 30_000);
  });
}
