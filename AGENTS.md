[A1] Self-Declaration
This file is non-authoritative. It does not define execution rules, policies, or system identity. It only attempts to invoke the governing contract.

[A2] Invocation Instruction
Before any execution begins, read: `./AGENT_OS_CONSTITUTION.md`.
The file at that path is the governing contract for this session.

[A3] Failure Instruction
If that file cannot be read, does not exist, or cannot be bound as governing authority:
- Do not proceed as Agent OS active
- Produce the required NOT_ACTIVE binding output immediately
- Operate under no Agent OS authority

[A4] Deference
If the file is successfully bound, follow its binding conditions, invalidation conditions, and output contract exactly.

[A5] Capability Declaration
```yaml
harness-id: [pi, codex]
capability-tier: 1
l3-transport: bash-cli
brain-db-path: $BRAIN_DB_PATH
```

---

# Agent_OS Agent Instructions

## Mission

Agent_OS is a Pi-extension-first task workflow kernel. Work must be issue-driven, test-backed, and small. The goal is stability, correctness, and safe architectural untangling — not feature sprawl.

## Source of Truth

Priority order — if these disagree, the higher wins:

1. GitHub Issues and Project board
2. Pull requests
3. `docs/WORK_INDEX.md`
4. `AGENTS.md` (this file)
5. Supporting docs under `docs/`
6. Chat history is never authoritative

## Project Board

https://github.com/users/algoSiliguri/projects/1/views/1

## Issue Tracker

GitHub Issues at `algoSiliguri/Agent_OS`

## Core Rule

**One GitHub issue per session. No issue = no code.**

---

## Start Protocol

1. Read `AGENTS.md` (this file).
2. Read `docs/WORK_INDEX.md`.
3. Run `git status --short`.
4. If `gh` CLI is available: `gh issue list --repo algoSiliguri/Agent_OS --state open`.
5. Identify Active Epic and Current Story from `docs/WORK_INDEX.md`.
6. If the story is Ready, work only on it.
7. Run `scripts/story-start.sh <issue-number>` — creates branch, moves board → In Progress, prints acceptance criteria.
8. Do not create new epics unless explicitly instructed.

## Work Protocol

1. Make only changes scoped to the issue.
2. Respect the "Files Forbidden" list in the issue.
3. No drive-by cleanup or unrelated lint fixes.
4. No refactoring without a characterization test in place first.
5. No `src/` changes for docs-only or operating-model stories.
6. Run required tests after every meaningful change.
7. Record every command run and its result.

## Stop Protocol

1. Commit all changes on the story branch.
2. Run `scripts/story-done.sh` — runs tests, pushes branch, creates PR, moves board → In Review.
3. After PR is merged: run `scripts/story-close.sh <issue-number>` — routes board → Dev Verified or Done, returns to main.
4. State the exact next action. Stop.

> `docs/WORK_INDEX.md` is optional agent context — the board is authoritative. Update WORK_INDEX only when adding handoff value not visible on the board.

## Safety Rules

- One issue. One branch. One PR.
- No source changes without an issue.
- No success claim without actual command output.
- No broad rewrites.
- If `src/` changed unexpectedly: stop, report, do not commit.
- GitHub issue state beats `docs/WORK_INDEX.md` if they disagree.

---

## Current Active Work

Active epic: **#78 EPIC-004: Bootstrap, /init UX, and Knowledge DB Reliability**
Current story: **#17** — Canonical bootstrap docs + /init idempotency (first Ready story)

Default next action:
`scripts/story-start.sh 17`

---

## Full Epic Roadmap (do in order)

| Epic | Issue | Title | Stories | Status |
|------|-------|-------|---------|--------|
| EPIC-001–003 | closed | Security hardening, characterization tests, smoke matrix | — | ✅ Done |
| **EPIC-004** | **#78** | **Bootstrap, /init UX, Knowledge DB Reliability** | #17, #19–#23 | 🔄 Active |
| EPIC-005 | #79 | Failure Boundary Hardening | #80, #81, #82 | ⬜ Next |
| EPIC-006 | #83 | Runtime Port Decomposition | #84, #85, #86, #87 | ⬜ Queued |
| EPIC-007 | #88 | Workflow State Authority | #89, #90, #91 | ⬜ Queued |
| EPIC-008 | #92 | Init And Doctor Reliability Slice | #93, #94, #95 | ⬜ Queued |

**Story dependency order within epics:**
- EPIC-005: #80 → #81 → #82 (independent, but 1.2 must precede 3.3)
- EPIC-006: #84, #85 first → #86 (depends on #85) → #87 (depends on EPIC-005 #81)
- EPIC-007: #89, #90 (independent) → #91 (depends on EPIC-005 #81)
- EPIC-008: #93, #94, #95 (independent)

**Board:** https://github.com/users/algoSiliguri/projects/1/views/1

---

## God Nodes (characterization test required before any change)

| Node | File | Edges |
|---|---|---|
| `emitAndProject()` | `src/core/projector.ts` | 36 |
| `ccpBase()` | `src/ccp/ccp-events.ts` | 35 |
| `writeArtifact()` | `src/ccp/artifacts/io.ts` | 33 |
| `makeEnvelope()` | `src/ccp/artifacts/envelope.ts` | 32 |
| `taskArtifactPath()` | `src/ccp/task-paths.ts` | 27 |
| `transitionTaskLifecycle()` | `src/ccp/commands/shared/task-lifecycle.ts` | 24 |
| `PiSession` | `src/pi/pi-session.ts` | 24 |

---

## Key Docs

| Doc | Purpose |
|---|---|
| `docs/WORK_INDEX.md` | Current work checkpoint |
| `docs/SOLO_DEV_OPERATING_MODEL.md` | Issue types, labels, board layout |
| `docs/DEFINITION_OF_DONE.md` | Ready/Done checklists |
| `docs/PI_RUNTIME_SMOKE_MATRIX.md` | Test coverage per slash command |
| `docs/DEV_PROD_ENVIRONMENTS.md` | Dev vs prod isolation rules |
| `docs/RELEASE_PROCESS.md` | SemVer policy, release checklist |
| `docs/INSTALL_UPDATE_UNINSTALL_CONTRACT.md` | What /init creates, update/uninstall steps |
| `scripts/smoke/README.md` | Manual prod install smoke steps |

---

## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

- Read `graphify-out/GRAPH_REPORT.md` before reading source files, running grep/glob, or answering codebase questions.
- For cross-module questions, prefer `graphify query "<question>"` over grep.
- After modifying code, run `graphify update .` (AST-only, no API cost).
