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

## Epic Roadmap

| Epic | Issue | Stories | Status |
|------|-------|---------|--------|
| EPIC-001–003 | closed | Security, tests, smoke matrix | ✅ Done |
| **EPIC-004** | **#78** | #17, #19–#23 | 🔄 Active — start #17 |
| EPIC-005 | #79 | #80 Projector, #81 PackRuntime, #82 BrainResult | ⬜ Next |
| EPIC-006 | #83 | #84 CommandRunner, #85 ArtifactRepo interface, #86 migrate callers, #87 ExtensionRoot | ⬜ Queued |
| EPIC-007 | #88 | #89 LifecycleStore, #90 TaskPointer, #91 ValidatorGate | ⬜ Queued |
| EPIC-008 | #92 | #93 /init split, #94 DoctorPolicy, #95 BindingReport | ⬜ Queued |

## Notes

- Do EPIC-004 before EPIC-005 (feature work first, refactoring after).
- EPIC-006 story #87 depends on EPIC-005 #81. EPIC-007 story #91 depends on EPIC-005 #81.
- Board is authoritative. WORK_INDEX is agent handoff context only.
- `agent-os-starter` stable tag not yet published.
