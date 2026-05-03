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
