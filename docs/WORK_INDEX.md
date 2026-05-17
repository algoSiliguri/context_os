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

**#39 STORY-011: Characterize ccpBase event builders**
https://github.com/algoSiliguri/Agent_OS/issues/39
Status: Ready

## Next Action

Move #39 to In Progress → branch `story-011-characterize-ccp-base` → add characterization tests for `ccpBase` event builders → run `npm test` → do not touch `src/`.

## Last Checkpoint

- Commit: `bdf828f`
- Date: 2026-05-17
- Branch: `story-010-characterize-emit-and-project` → PR #44 open
- Working tree: clean (graphify-out/ changes are untracked/generated)
- `npm run typecheck`: PASS
- `npm test`: PASS — 583 tests, 99 files
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, non-blocking

## Resume Command

```
Use AGENTS.md. Continue the next Ready issue from the GitHub Project board.
```

## Notes

- EPIC-000 complete (issues #27–#36 all closed).
- EPIC-001 in progress: STORY-010 done (#38 closed, PR #44). STORY-011 through STORY-015 (#39–#43) in Inbox.
- Do not start multiple stories.
- Do not create more epics yet.
- `agent-os-starter` stable tag not yet published.
