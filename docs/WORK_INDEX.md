# Agent_OS Work Index

## Purpose

GitHub Issues and the Project board are the source of truth.
This file is a local AI handoff checkpoint only. GitHub wins on conflicts.

## Board

https://github.com/users/algoSiliguri/projects/1/views/1

## Active Epic

**EPIC-002** (#54) — Artifact Contract Hardening

## Current Story

**STORY-021** (#58) — Update PI_RUNTIME_SMOKE_MATRIX after artifact command coverage
Status: **In Review** — PR open, awaiting merge.

## Next Action

Merge PR for STORY-021. EPIC-002 complete.

## Last Checkpoint

- Commit: on branch `story-021-smoke-matrix-update` (PR open)
- Date: 2026-05-18
- Working tree: clean
- `npm run typecheck`: PASS
- `npm test`: PASS — 662 tests, 102 files (no new tests; docs-only story)
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
- EPIC-002 created (#54). Stories #55–#59 on board.
- STORY-018 done (#55, PR #60 merged). +6 characterization tests for runReview.
- STORY-019 done (#56, PR #61 merged). +8 characterization tests for runEvaluate. Two bugs fixed in PR #62.
- STORY-020 done (#57, PR #63 merged). +3 characterization tests for runQuickTask.
- STORY-021 in review (#58, PR open). Matrix + CONTEXT.md updated.
- Board sync is now fully automatic — no manual sync needed.
- Do not start multiple stories.
- `agent-os-starter` stable tag not yet published.
