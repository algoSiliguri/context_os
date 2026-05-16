# Agent_OS Work Index

## Purpose

GitHub Issues at `algoSiliguri/Agent_OS` are the source of truth for all
work tracking. This file is a local AI handoff mirror only. If this file
and GitHub Issues disagree, GitHub Issues win. Update this file after
completing each issue.

---

## Active Epic

**EPIC-000: Solo Development Operating System**
Goal: Every future change is tracked, tested by risk tier, verified in dev
and prod when needed, releasable, and understandable later.
GitHub: https://github.com/algoSiliguri/Agent_OS/issues/27

---

## Current Issue

**STORY-001: Create Agent_OS GitHub Project Board**
Status: Done (board created 2026-05-16 via gh CLI, 10 issues added, all fields set)
GitHub: https://github.com/algoSiliguri/Agent_OS/issues/28

---

## Next Issue

**STORY-005: Add Dev vs Prod Environment Guide**
Status: Ready (file committed at 33273d4, needs manual verification)
GitHub: https://github.com/algoSiliguri/Agent_OS/issues/32

---

## Blocked

None.

---

## Last Verified

- Commit: `875e6e2`
- Date: 2026-05-16
- `npm run typecheck`: PASS (clean)
- `npm test`: PASS (580 tests, 98 files)
- `npm run lint`: KNOWN FAIL — 173 Biome formatting errors, no correctness impact.
  Non-blocking. Tracked as debt in `docs/DEFINITION_OF_DONE.md`.
- Dev Pi smoke: SKIPPED — requires 3 sibling repos, not run in this session.
  See `docs/DEV_PROD_ENVIRONMENTS.md`.
- Prod clean install smoke: SKIPPED — no release candidate tagged yet.
  See `scripts/smoke/README.md` for manual steps.

---

## Last AI Handoff

Session: 2026-05-16 architectural-untanglement + solo-dev-operating-model
Performed by: Claude Sonnet 4.6

**What happened this session:**
- Full architectural untanglement report produced (all 10 phases).
- Solo-dev operating model designed and all safe files created on disk.
- No src/ files touched. No runtime behavior changed.
- 13 files created: `.github/` templates, `.github/workflows/ci.yml`,
  and `docs/` operating model docs.
- Baseline confirmed: typecheck clean, 580 tests pass.
- gh CLI confirmed authenticated as `algoSiliguri`.

**What is NOT done yet:**
- GitHub Project board not created (STORY-001 — manual UI task).
- STORY-002 through STORY-009 need manual verification step each.
- `agent-os-starter` stable tag not published.

**Next human action:** Create GitHub Project board (STORY-001).

**Next AI action:** Read this file, read `docs/SOLO_DEV_OPERATING_MODEL.md`,
check `gh issue list`, pick exactly one Ready issue, do only that.

---

## Resume Protocol for AI Agents

Follow these steps exactly. Do not skip. Do not reorder.

1. Read `docs/WORK_INDEX.md` (this file).
2. Read `docs/SOLO_DEV_OPERATING_MODEL.md`.
3. Run `gh issue list --repo algoSiliguri/Agent_OS --state open` if gh is available.
4. Pick **exactly one** Ready issue. If none are Ready, stop and ask the human.
5. Create or checkout one branch: `git checkout -b story-NNN-short-name`
6. Make only changes scoped to that issue. Touch no other files.
7. Run `npm run typecheck && npm test`. Both must pass before continuing.
8. Complete verification steps from the issue's "Dev Verification" field.
9. Update this file's "Last Verified" and "Current Issue" sections.
10. Open a PR with `Closes #N` in the description. Stop.

---

## Operating Rules

- Never work on more than one issue per session.
- Never modify files outside the issue's "Files Likely Touched" list.
- Never touch `src/` during operating-model-only stories (EPIC-000 stories).
- Always record every command run and its result.
- Always record skipped verification steps with explicit reason.
- If a verification step cannot run, say why — do not silently skip.
- GitHub issue state beats this file when they disagree.
- If this file is stale, update it before doing any other work.

---

## GitHub Issues (created 2026-05-16)

| Issue | Title | URL |
|---|---|---|
| EPIC-000 | Solo Development Operating System | https://github.com/algoSiliguri/Agent_OS/issues/27 |
| STORY-001 | Create Agent_OS GitHub Project Board | https://github.com/algoSiliguri/Agent_OS/issues/28 |
| STORY-002 | Add Issue and PR Templates | https://github.com/algoSiliguri/Agent_OS/issues/29 |
| STORY-003 | Add Definition of Ready and Done | https://github.com/algoSiliguri/Agent_OS/issues/30 |
| STORY-004 | Add CI Baseline | https://github.com/algoSiliguri/Agent_OS/issues/31 |
| STORY-005 | Add Dev vs Prod Environment Guide | https://github.com/algoSiliguri/Agent_OS/issues/32 |
| STORY-006 | Add Install / Update / Uninstall Contract | https://github.com/algoSiliguri/Agent_OS/issues/33 |
| STORY-007 | Add Pi Runtime Smoke Matrix | https://github.com/algoSiliguri/Agent_OS/issues/34 |
| STORY-008 | Add Release Candidate Checklist | https://github.com/algoSiliguri/Agent_OS/issues/35 |
| STORY-009 | Add Clean Prod Install Smoke Script Design | https://github.com/algoSiliguri/Agent_OS/issues/36 |

## Issue Drafts (archived — issues now live in GitHub)

Repository: `algoSiliguri/Agent_OS`

---

### EPIC-000: Solo Development Operating System

```
Title: EPIC-000: Solo Development Operating System
Type: Epic
Risk: P1
Visible Behavior Changed: no
Install Impact: docs-only

Problem:
Agent_OS has no operating model. Changes are freehand. No issue templates,
no CI, no release gate, install/update/uninstall are undocumented, and 6
slash commands have zero test coverage. Future architectural refactors
(god node characterization, binding hardening) cannot be done safely without
this foundation.

Acceptance Criteria:
- STORY-001 through STORY-009 all Done
- CI runs on every PR (test + typecheck blocking; lint non-blocking)
- Issue and PR templates exist and render in GitHub
- Definition of Done and Ready documented in docs/
- Dev vs Prod environment separation documented
- Install/update/uninstall contract documented
- Pi runtime smoke matrix documented

Files Forbidden: src/
```

---

### STORY-001: Create Agent_OS GitHub Project Board

```
Title: STORY-001: Create Agent_OS GitHub Project Board
Type: Story  Epic: EPIC-000  Risk: P3
Visible Behavior Changed: no  Install Impact: none

Problem:
No GitHub Project exists. Work is invisible.

Acceptance Criteria:
- Project board exists at algoSiliguri/Agent_OS
- 7 columns: Inbox / Ready / In Progress / In Review / Dev Verified / Prod Verified / Done
- Labels created per docs/SOLO_DEV_OPERATING_MODEL.md
- Custom fields: Type, Epic, Risk, Environment, Verification, Release Target,
  Visible Behavior Changed, Install Impact
- EPIC-000 added to board and moved to In Progress

Files Forbidden: src/
```

---

### STORY-002: Add Issue and PR Templates

```
Title: STORY-002: Add Issue and PR Templates
Type: Story  Epic: EPIC-000  Risk: P3
Visible Behavior Changed: no  Install Impact: none

Problem:
.github/ has only copilot-instructions.md. No templates. Issues are free-form.

Current Evidence:
Files exist on disk (created 2026-05-16) but not yet committed/pushed.

Acceptance Criteria:
- 4 issue templates render in GitHub template picker
- PR template renders on new PRs
- All fields match Definition of Ready

Files Touched: .github/ISSUE_TEMPLATE/*.md, .github/pull_request_template.md
Files Forbidden: src/
```

---

### STORY-003: Add Definition of Ready and Done

```
Title: STORY-003: Add Definition of Done and Definition of Ready
Type: Story  Epic: EPIC-000  Risk: P3
Visible Behavior Changed: no  Install Impact: docs-only

Problem:
No documented standard for story readiness or completion.

Current Evidence:
docs/DEFINITION_OF_DONE.md exists on disk (2026-05-16) but not committed.

Acceptance Criteria:
- File committed and accessible
- DoR checklist present (10 fields)
- DoD checklist present (all gates)
- God node list present
- Known debt section present

Files Touched: docs/DEFINITION_OF_DONE.md
Files Forbidden: src/
```

---

### STORY-004: Add CI Baseline

```
Title: STORY-004: Add CI Baseline for Test and Typecheck
Type: Story  Epic: EPIC-000  Risk: P2
Visible Behavior Changed: no  Install Impact: none

Problem:
No GitHub Actions CI. No automated gate on PRs.

Current Evidence:
.github/workflows/ci.yml exists on disk (2026-05-16) but not pushed.
npm test: 580 pass. npm run typecheck: clean.
npm run lint: 173 formatting errors (non-blocking).

Acceptance Criteria:
- CI triggers on push and PR
- typecheck and test are blocking
- lint runs with continue-on-error: true (known 173 errors)
- CI passes on current HEAD

Files Touched: .github/workflows/ci.yml
Files Forbidden: src/
```

---

### STORY-005: Add Dev vs Prod Environment Guide

```
Title: STORY-005: Add Dev vs Prod Environment Guide
Type: Story  Epic: EPIC-000  Risk: P2
Visible Behavior Changed: no  Install Impact: docs-only

Problem:
No separation documented between dev (source) and prod (clean install) testing.
dev:smoke requires 3 sibling repos and cannot substitute for prod smoke.

Current Evidence:
docs/DEV_PROD_ENVIRONMENTS.md exists on disk but not committed.

Acceptance Criteria:
- Prod smoke directory convention documented (/tmp/agent-os-prod-smoke/<ts>/)
- Source mode detection step documented
- False confidence trap section present
- dev:smoke limitation documented

Files Touched: docs/DEV_PROD_ENVIRONMENTS.md
Files Forbidden: src/
```

---

### STORY-006: Add Install / Update / Uninstall Contract

```
Title: STORY-006: Add Install / Update / Uninstall Contract
Type: Story  Epic: EPIC-000  Risk: P1
Visible Behavior Changed: no  Install Impact: docs-only

Problem:
Install depends on external agent-os-starter. Update undocumented beyond
README hint. Uninstall not documented anywhere.

Current Evidence:
docs/INSTALL_UPDATE_UNINSTALL_CONTRACT.md exists on disk but not committed.
scripts/verify_agent_os_bundle.py references non-existent Python files (BROKEN).

Acceptance Criteria:
- Full file manifest of what /init creates documented
- User-owned vs generated distinction explicit
- Safe uninstall steps documented
- Full purge steps with warning documented
- Broken bundle verifier noted as known debt

Files Touched: docs/INSTALL_UPDATE_UNINSTALL_CONTRACT.md
Files Forbidden: src/
```

---

### STORY-007: Add Pi Runtime Smoke Matrix

```
Title: STORY-007: Add Pi Runtime Smoke Matrix
Type: Story  Epic: EPIC-000  Risk: P2
Visible Behavior Changed: no  Install Impact: none

Problem:
No documented verification coverage per slash command.
/review, /evaluate, /flow, /continue, /memory, /quick-task, /flight
have zero unit tests.

Current Evidence:
docs/PI_RUNTIME_SMOKE_MATRIX.md exists on disk but not committed.

Acceptance Criteria:
- All 16 commands listed with Exists/Missing test status
- Zero-coverage commands flagged
- Event assertion gap documented
- Prod clean install requirement documented per command

Files Touched: docs/PI_RUNTIME_SMOKE_MATRIX.md
Files Forbidden: src/
```

---

### STORY-008: Add Release Candidate Checklist

```
Title: STORY-008: Add Release Candidate Checklist
Type: Story  Epic: EPIC-000  Risk: P1
Visible Behavior Changed: no  Install Impact: docs-only

Problem:
No release process. Version bumps manual. Bundle verifier broken.
No checklist before tagging.

Current Evidence:
docs/RELEASE_PROCESS.md exists on disk but not committed.
scripts/verify_agent_os_bundle.py: references context_os_runtime/*.py (do not exist).

Acceptance Criteria:
- SemVer policy documented
- Release channels documented (dev/beta/stable)
- Pre-release checklist complete (test/typecheck/smoke/version/tag)
- Broken bundle verifier documented as known debt
- /doctor version verification step explicit

Files Touched: docs/RELEASE_PROCESS.md
Files Forbidden: src/
```

---

## Architecture Debt Index

Quick reference for the top issues identified in the architectural report.
Full detail in the architectural untanglement report (previous session).

| Issue | File | Priority | Requires characterization test first? |
|---|---|---|---|
| Binding not enforced at session_start | `src/core/binding.ts`, `src/pi/extension.ts` | P0 | Yes — add BINDING event type test |
| `writeTaskState` backdoor (state write without event) | `src/ccp/commands/shared/task-loader.ts:38` | P1 | Yes — characterize state writes |
| `writeArtifactRaw` bypasses schema | `src/ccp/artifacts/io.ts:89` | P1 | Yes — round-trip test per artifact type |
| Tool call policy inline in extension.ts (130 lines) | `src/pi/extension.ts:88-209` | P1 | Yes — characterize current handler behavior |
| `src/core/` flat namespace (29 files, no structure) | `src/core/` | P2 | No — add README.md only |
| 6 commands with zero unit tests | `/review`,`/evaluate`,`/flow`,`/continue`,`/memory`,`/quick-task` | P2 | N/A — add characterization tests |
| Bundle verifier references non-existent Python files | `scripts/verify_agent_os_bundle.py` | P1 | No — fix or delete script |
