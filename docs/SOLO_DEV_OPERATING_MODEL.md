# Agent_OS Solo Development Operating Model

Simple. GitHub-native. No Jira. One issue per change. One PR per issue.

---

## Core Philosophy

- Every meaningful change is an issue before it is code
- Every issue has acceptance criteria before work starts
- Every PR is linked to an issue
- Tests protect behavior; characterization tests protect god nodes
- Dev verification and prod verification are separate and explicit
- Install/update/uninstall are first-class concerns, not afterthoughts
- Rollback is documented before merging, not after something breaks

---

## Issue Types

| Type | When to use |
|---|---|
| **Epic** | Parent for a group of related stories. Describes a capability, not a task. |
| **Story** | Single deliverable change. Fits in one PR. Has acceptance criteria. |
| **Bug** | Broken behavior with reproduction steps and file:line evidence. |
| **Spike** | Time-boxed research with a concrete output artifact. |
| **Release** | Release coordination issue. Links checklist to a version tag. |

Use the GitHub issue templates in `.github/ISSUE_TEMPLATE/`.

---

## GitHub Project Board

Columns (Kanban):
```
Inbox → Ready → In Progress → In Review → Dev Verified → Prod Verified → Done
```

**Inbox:** Idea captured, not yet ready.
**Ready:** All Definition of Ready fields filled. Safe to start.
**In Progress:** Work started. One person owns it.
**In Review:** PR open. Awaiting self-review or second read.
**Dev Verified:** Tests pass, typecheck clean, dev smoke done.
**Prod Verified:** Prod clean install smoke done (if required).
**Done:** All Definition of Done boxes checked. Issue closed.

---

## Custom Fields

| Field | Values |
|---|---|
| Type | Epic / Story / Bug / Spike / Release |
| Epic | Issue link |
| Risk | P0 / P1 / P2 / P3 |
| Environment | Dev / Prod / Both |
| Verification | Unit / Integration / Characterization / Dev Pi Smoke / Prod Clean Install / Manual |
| Release Target | dev / beta / stable |
| Visible Behavior Changed | yes / no |
| Install Impact | none / install / update / uninstall / packaging / docs-only |

---

## Labels

Create these labels in GitHub:

```
type: epic          purple
type: story         blue
type: bug           red
type: spike         yellow
type: release       green
risk: p0            dark red
risk: p1            orange
risk: p2            yellow
risk: p3            gray
env: dev            light blue
env: prod           dark blue
env: both           teal
install-impact      brown
behavior-change     pink
needs-characterization-test  dark orange
```

---

## Risk Levels

| Level | Meaning | Examples |
|---|---|---|
| **P0** | Safety, authority, data corruption, or install breakage | Auth bypass, event log corruption, /init breaks |
| **P1** | Breaks a common workflow | Command throws unexpectedly, state machine bypass, artifact schema mismatch |
| **P2** | Confusing or fragile but recoverable | Silent fallback, wrong log output, stale dashboard |
| **P3** | Cleanup only | Lint, docs, rename, comment |

---

## Environment Requirements by Risk

| Risk | Dev verification | Prod verification |
|---|---|---|
| P0 | Required | Required |
| P1 | Required | Required if install-impact |
| P2 | Required | Required if install-impact |
| P3 | Optional | Not required |

---

## Workflow: One Change From Idea to Done

```
1. Create issue using template (Inbox)
2. Fill all Definition of Ready fields (move to Ready)
3. Branch: git checkout -b story-NNN-short-description
4. Write characterization test if touching a god node (see DEFINITION_OF_DONE.md)
5. Make changes
6. npm test && npm run typecheck
7. Complete dev verification steps
8. Complete prod verification steps if required
9. Open PR with Closes #N in description
10. Complete PR Definition of Done checklist
11. Merge
12. Close issue, move to Done column
```

---

## Key Documents

| Document | Purpose |
|---|---|
| `docs/DEFINITION_OF_DONE.md` | Ready and Done checklists; god node list |
| `docs/DEV_PROD_ENVIRONMENTS.md` | Dev vs prod separation rules |
| `docs/RELEASE_PROCESS.md` | SemVer policy, release channels, checklist |
| `docs/INSTALL_UPDATE_UNINSTALL_CONTRACT.md` | What /init creates; update/uninstall steps |
| `docs/PI_RUNTIME_SMOKE_MATRIX.md` | Test coverage per slash command |
| `scripts/smoke/README.md` | Manual prod smoke steps |

---

## Current Epics

| Epic | Status | Description |
|---|---|---|
| EPIC-000 | In Progress | Solo Development Operating System (this work) |
| EPIC-001 (future) | Inbox | State + Event Spine Protection (characterization tests) |
| EPIC-002 (future) | Inbox | Artifact Contract Hardening |
| EPIC-003 (future) | Inbox | Binding at Session Start |
| EPIC-004 (future) | Inbox | Tool Call Gateway Extraction |
