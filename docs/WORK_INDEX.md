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

**#41 STORY-013: Audit writeArtifactRaw call sites**
https://github.com/algoSiliguri/Agent_OS/issues/41
Status: Ready

## Next Action

Move #41 to In Progress → branch `story-013-audit-write-artifact-raw` → audit all `writeArtifactRaw` call sites in `src/` → do not touch `src/` (audit only, report findings).

## Last Checkpoint

- Commit: `2dc897a`
- Date: 2026-05-17
- Branch: `story-012-characterize-artifact-io` → PR #46 open
- Working tree: clean (graphify-out/ changes are untracked/generated)
- `npm run typecheck`: PASS
- `npm test`: PASS — 636 tests, 99 files
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, non-blocking

## Resume Command

```
Use AGENTS.md. Continue the next Ready issue from the GitHub Project board.
```

## Notes

- EPIC-000 complete (issues #27–#36 all closed).
- EPIC-001 in progress: STORY-010 done (#38, PR #44), STORY-011 done (#39, PR #45), STORY-012 done (#40, PR #46). STORY-013 through STORY-015 (#41–#43) in Inbox.
- Do not start multiple stories.
- Do not create more epics yet.
- `agent-os-starter` stable tag not yet published.
