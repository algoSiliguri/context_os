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

**#40 STORY-012: Per-artifact-type write→read round-trip tests**
https://github.com/algoSiliguri/Agent_OS/issues/40
Status: Ready

## Next Action

Move #40 to In Progress → branch `story-012-characterize-artifact-io` → add round-trip tests for all 9 artifact types → run `npm test` → do not touch `src/`.

## Last Checkpoint

- Commit: `e3364df`
- Date: 2026-05-17
- Branch: `story-011-characterize-ccp-base` → PR #45 open
- Working tree: clean (graphify-out/ changes are untracked/generated)
- `npm run typecheck`: PASS
- `npm test`: PASS — 627 tests, 99 files
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, non-blocking

## Resume Command

```
Use AGENTS.md. Continue the next Ready issue from the GitHub Project board.
```

## Notes

- EPIC-000 complete (issues #27–#36 all closed).
- EPIC-001 in progress: STORY-010 done (#38, PR #44), STORY-011 done (#39, PR #45). STORY-012 through STORY-015 (#40–#43) in Inbox.
- Do not start multiple stories.
- Do not create more epics yet.
- `agent-os-starter` stable tag not yet published.
