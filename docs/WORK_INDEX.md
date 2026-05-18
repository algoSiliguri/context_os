# Agent_OS Work Index

## Purpose

GitHub Issues and the Project board are the source of truth.
This file is a local AI handoff checkpoint only. GitHub wins on conflicts.

## Board

https://github.com/users/algoSiliguri/projects/1/views/1

## Active Epic

**EPIC-003** (#65) — Pre-v1 Security Hardening and Contract Formalization

## Current Story

None started. Next: #17 — Canonical bootstrap docs (first story of EPIC-004).

## Next Action

`scripts/story-start.sh 17`

## Last Checkpoint

- Commit: `72b04d0` (main, STORY-021 merged)
- Date: 2026-05-18
- Working tree: clean
- `npm run typecheck`: PASS
- `npm test`: PASS — 662 tests, 102 files
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, non-blocking

## Resume Command

```
Use AGENTS.md. Continue the next Ready issue from the GitHub Project board.
```

## Notes

- EPIC-000 complete (#27–#36, closed).
- EPIC-001 complete (#37–#43, PRs #44–#50, closed 2026-05-17). +62 characterization tests.
- EPIC-002 complete (#54, closed 2026-05-18). Stories #55–#59 done. +17 tests, 2 bugs fixed.
- EPIC-003 complete (#65, closed 2026-05-18). Stories #9–#16 + #66 done. 666 tests pass. readArtifactRaw deleted, BRAIN_DB_PATH hard-fail, supply chain pinned.
- EPIC-004 created (#78). Stories: #17, #19–#23 (bootstrap/UX slices).
- Board sync is fully automatic — no manual sync needed.
- Do not start multiple stories.
- `agent-os-starter` stable tag not yet published.
