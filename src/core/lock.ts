import { type Static, Type } from '@sinclair/typebox';

export const LockRecord = Type.Object({
  session_id: Type.String(),
  project_id: Type.String(),
  repo_root: Type.String(),
  log_path: Type.String(),
});
export type LockRecord = Static<typeof LockRecord>;

// I/O wrappers (writeLock / readLock / validateLock) are deferred to Plan 2,
// where session lifecycle code consumes them. Plan 1 ships only the schema.
