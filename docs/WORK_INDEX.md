# Agent_OS Work Index

## Purpose

GitHub Issues and the Project board are the source of truth.
This file is a local AI handoff checkpoint only. GitHub wins on conflicts.

## Board

https://github.com/users/algoSiliguri/projects/1/views/1

## Active Epic

**EPIC-003** (#65) — Pre-v1 Security Hardening and Contract Formalization

## Current Story

STORY-025 (#11) — BrainClient failure classification. Verification close: implementation shipped in af84e02, all ACs satisfied.

## Next Action

After #11 closes: implement STORY-026 (#12) — BRAIN_DB_PATH hard-fail (real code change needed).

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
- STORY-016 done (#48, PR #52). review.ts + evaluate.ts migrated to validated readArtifact.
- STORY-017 done (#51, PR #53). Annotation clarified; full encapsulation not feasible (17 test uses).
- EPIC-002 complete (#54, closed 2026-05-18). Stories #55–#59 done. +17 tests, 2 bugs fixed.
- STORY-021 done (#58, PR #64 merged). Matrix + CONTEXT.md updated.
- STORY-022 done (#59, closed). Spike: readArtifactRaw → migrate plan.ts to readArtifact('diagnosis').
- EPIC-003 created (#65). Stories: #9–#16 (existing) + #66 (new, plan.ts migration).
- STORY-023 (#9) is next — tier-policy floor, P1 ship-blocking security fix.
- Board sync is now fully automatic — no manual sync needed.
- Do not start multiple stories.
- `agent-os-starter` stable tag not yet published.
