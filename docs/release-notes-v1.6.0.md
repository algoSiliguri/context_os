# Agent_OS v1.6.0 Release Notes

## Summary

v1.6.0 is a release-hardening cut for the local-first Agent_OS ecosystem. It
focuses on safe local development, clear install provenance, and guarded
normal-user lifecycle operations across Agent_OS, agent-os-starter, and
knowledge-brain.

## Added

- Isolated local developer smoke test: `npm run dev:smoke` runs Agent_OS from
  local source with an isolated `PI_CODING_AGENT_DIR`, disposable project, and
  project-local brain database.
- Doctor provenance reporting for Pi, Agent_OS package path/version/source mode,
  Agent_OS git commit, project initialization, runtime/task directories, and
  knowledge-brain availability/version/database path.
- First-class agent-os-starter lifecycle wrappers:
  - `bash setup.sh`
  - `bash doctor.sh`
  - `bash update.sh`
  - `bash uninstall.sh`
  - `bash smoke-user-install.sh`
- Shared lifecycle source-of-truth file:
  `agent-os-starter/agent-os-install.env`.
- Non-mutating release readiness check:
  `bash doctor.sh --release-check` or `bash release-check.sh`.
- Guarded user/global smoke command that refuses to run without an explicit
  acknowledgement flag.

## Changed

- User install/update/uninstall flows now read Agent_OS and knowledge-brain
  targets from `agent-os-install.env` instead of hardcoded release refs.
- Update and uninstall support `--dry-run`.
- Uninstall preserves `.agent-os`, `data_store`, and the shared
  knowledge-brain tool by default.
- Install manifests now record expected versions, source refs, install channel,
  Pi agent directory, brain DB path, and install mode.
- `/doctor` now reports repair commands instead of hiding stale or missing
  global tools.

## Fixed

- Removed stale Agent_OS `v1.4.0` lifecycle behavior from starter install/update
  paths.
- Local development smoke no longer overlaps with the real global Pi profile.
- `brain --version` support is available in knowledge-brain v1.0.1 and exits 0
  when the current tool install is up to date.

## Verification

Verified locally before release cut:

- `npm run typecheck`
- `npm test`
- `npm run dev:smoke`
- `bash setup.sh --dry-run`
- `bash update.sh --dry-run`
- `bash uninstall.sh --dry-run`
- `bash smoke-user-install.sh`
- `bash smoke-user-install.sh --i-understand-this-mutates-user-install --dry-run`
- `uv run brain --version`
- `uv run pytest tests/ -q`

## Known Limitations

- Until the public `v1.6.0` Agent_OS tag exists and
  `agent-os-starter/agent-os-install.env` is switched from `main` to `v1.6.0`,
  `release-check.sh` must fail.
- Existing user machines may have an older globally installed `brain` command.
  Doctor reports this as a repairable user-machine state.
- The user/global smoke command is intentionally gated because it can touch the
  real Pi user profile when run without `--dry-run`.

## Upgrade Notes

1. Update `agent-os-starter` to the release commit.
2. Run `bash doctor.sh` to inspect current user/global state.
3. Run `bash update.sh --dry-run`.
4. Run `bash update.sh`.
5. Open Pi in the project and run `/doctor`.

Project-local `.agent-os` state and `data_store` are preserved by update.

## Rollback Notes

- To unregister Agent_OS from Pi without deleting project data:

  ```bash
  bash uninstall.sh --dry-run
  bash uninstall.sh
  ```

- By default uninstall preserves `.agent-os`, `data_store`, and
  knowledge-brain. Use destructive flags only after reading `bash uninstall.sh
  --help`.
