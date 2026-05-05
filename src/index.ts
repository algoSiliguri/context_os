// src/index.ts — Public API surface for downstream consumers (Plan 2 + future harness adapters)
export { bindProject, BindingError } from './core/binding';
export { verifyConstitution } from './core/constitution';
export { runDoctor } from './core/doctor';
export {
  computeConstitutionHash,
  computeJsonFileHash,
  normalizeConstitutionForHash,
} from './core/hash';
export { loadProjectConfig, ProjectConfig } from './core/manifest';
export { runtimeDir, eventLogPath, sessionSnapshotPath, lockPath } from './core/runtime-paths';
export { resolveRuntimeVersion } from './core/versioning';
export { SessionState, transition } from './core/state';
export type { Event } from './core/events';
export {
  buildBindingEvent,
  buildStateTransitionEvent,
  buildHeartbeatEvent,
  buildPermissionDeniedEvent,
  buildSkillLoadEvent,
  buildSkillUnloadEvent,
  buildViolationEvent,
  buildToolRequestedEvent,
  buildToolApprovedEvent,
  buildToolDeniedEvent,
} from './core/events';
export { readEvents } from './core/event-log';
export {
  appendJsonlEventAtomic,
  writeJsonAtomic,
  writeSessionSnapshot,
} from './core/session-store';
export { computeActionHash, requestCriticalAction, guardMemoryWrite } from './core/interceptor';
export { deriveActionStatus, type ActionStatus } from './core/approval';
export { mirrorApprovalEvent, initProjectionSchema } from './core/projection';
export {
  buildMemoryRoute,
  scopeToDbPath,
  type Scope,
  type MemoryRoute,
} from './core/memory-router';
export { LockRecord } from './core/lock';
export { ProjectManifest, SessionBindingRecord, validateProjectManifest } from './core/models';

// Pi extension entry (Pi auto-loads default export)
export { default as piExtension, getExtensionState, type ExtensionState } from './pi/extension';
export { ALL_COMMANDS, type CommandName } from './pi/slash-commands';

// CCP kernel exports for Plan 2b
export {
  TaskState,
  transitionTask,
  isTerminal,
  ALL_STATES as ALL_TASK_STATES,
} from './ccp/task-state-machine';
export { allocateNextTaskId, currentTaskCounter, formatTaskId } from './ccp/task-id';
export {
  taskDir,
  taskStatePath,
  taskArtifactPath,
  taskRawDir,
  taskRawFile,
  taskPendingCapturesPath,
  type ArtifactType,
} from './ccp/task-paths';
export * as ccpEvents from './ccp/ccp-events';
export { GrillRecord } from './ccp/artifacts/grill-record';
export { PlanArtifact } from './ccp/artifacts/plan-artifact';
export { ExecutionRecord } from './ccp/artifacts/execution-record';
export { VerificationRecord } from './ccp/artifacts/verification-record';
export { KnowledgeCaptureRecord, CaptureType } from './ccp/artifacts/knowledge-capture-record';
export { SessionStatus, makeSessionStatus } from './ccp/artifacts/session-status';
export {
  ArtifactEnvelope,
  makeEnvelope,
  CURRENT_SCHEMA_VERSION,
  CURRENT_POLICY_VERSION,
  CURRENT_MANIFEST_VERSION,
} from './ccp/artifacts/envelope';
export { writeArtifact, readArtifact } from './ccp/artifacts/io';
export { ToolClass, ALL_TOOL_CLASSES } from './ccp/policy/tool-classes';
export { ToolMetadata, ToolRegistry } from './ccp/policy/tool-registry';
export { resolveEffectiveTier, type Tier } from './ccp/policy/tier-resolver';
export { piPackageTrust, mcpServerTrust, type TrustLevel } from './ccp/policy/trust-registry';
export {
  decideToolCall,
  recordTier2Approval,
  type Decision,
  type ToolCall as PolicyToolCall,
  type DecisionContext,
  type SessionApprovalCache,
} from './ccp/policy/decision-flow';
export {
  BrainClient,
  type BrainNode,
  type BrainQueryResult,
  type WriteResult,
} from './ccp/brain/client';
export { replayFromEventLog, type ReplaySummary } from './ccp/recovery';
export {
  handleToolCall,
  type PiToolCallContext,
  type HandlerContext,
} from './pi/tool-call-handler';
export { wrapUi, type UiAdapter, type PiUiLike } from './pi/ui';
export { mirrorTaskEvent } from './core/projection';
