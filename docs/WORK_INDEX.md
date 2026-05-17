# Agent_OS Work Index

## Purpose

GitHub Issues and the Project board are the source of truth.
This file is a local AI handoff checkpoint only. GitHub wins on conflicts.

## Board

https://github.com/users/algoSiliguri/projects/1/views/1

## Active Epic

**#37 EPIC-001: State + Event Spine Protection**
https://github.com/algoSiliguri/Agent_OS/issues/37

## Current Story

EPIC-001 STORIES COMPLETE. Next: STORY-016 (#48) or STORY-017 (#51).

**#48 STORY-016: Migrate readArtifactRaw callers to validated readArtifact**
https://github.com/algoSiliguri/Agent_OS/issues/48

**#51 STORY-017: Move writeTaskState into task-lifecycle.ts as private**
https://github.com/algoSiliguri/Agent_OS/issues/51

## Next Action

Pick one of the above → move to In Progress → create branch → work.

## Last Checkpoint

- Commit: `3d24353`
- Date: 2026-05-17
- Branch: `story-015-remove-write-task-state-backdoor` → PR #50 open
- Working tree: clean (graphify-out/ changes are untracked/generated)
- `npm run typecheck`: PASS
- `npm test`: PASS — 642 tests, 99 files
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, non-blocking

## Resume Command

```
Use AGENTS.md. Continue the next Ready issue from the GitHub Project board.
```

## Notes

- EPIC-000 complete (issues #27–#36 all closed).
- EPIC-001 original stories complete: STORY-010–015 done (#38–#43, PRs #44–#50). Follow-ons: STORY-016 (#48, readArtifactRaw migration), STORY-017 (#51, writeTaskState encapsulation).
- Do not start multiple stories.
- Do not create more epics yet.
- `agent-os-starter` stable tag not yet published.
