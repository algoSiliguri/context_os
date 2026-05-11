// src/ccp/commands/shared/policy-decision-writer.ts
import { emitAndProject } from '../../../core/projector';
import {
  type PolicyDecisionOutcome,
  type PolicySubjectType,
  buildPolicyDecisionEvent,
} from '../../../core/events';

export interface PolicyDecisionFields {
  taskId?: string;
  phase?: string;
  subjectType: PolicySubjectType;
  subjectName: string;
  actionRequested: string;
  decision: PolicyDecisionOutcome;
  reasonCode: string;
  reason: string;
  riskTier?: number | null;
  approvedBy?: 'human' | 'system' | 'none';
  source: string;
  commandStr?: string;
  memoryCandidateRefs?: string[];
}

export function emitPolicyDecision(
  cwd: string,
  sessionId: string,
  fields: PolicyDecisionFields,
): void {
  try {
    emitAndProject(cwd, sessionId, buildPolicyDecisionEvent({ sessionId, ...fields }));
  } catch {
    // best-effort: never block primary operation
  }
}
