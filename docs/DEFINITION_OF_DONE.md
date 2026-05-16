# Definition of Ready and Definition of Done

## Definition of Ready

A story is ready to start only when all of the following are present in the issue:

- [ ] Clear problem statement with `file:line` evidence (no guessing)
- [ ] Desired behavior — specific enough to write a test for
- [ ] Files likely touched (named explicitly)
- [ ] Files forbidden to touch (named explicitly)
- [ ] Risk level set: P0 / P1 / P2 / P3
- [ ] Tests required — which type, which files, what they must assert
- [ ] Dev verification steps (runnable without tribal knowledge)
- [ ] Prod verification steps (if `Environment: Prod` or `Both`)
- [ ] Rollback plan (what to revert, how to detect breakage)
- [ ] `Visible Behavior Changed` declared: yes / no
- [ ] `Install Impact` declared

If any field is missing, move the issue back to **Inbox** until it is filled.

---

## Definition of Done

A story is done when **every** box below is checked.

### Code quality
- [ ] `npm test` passes — no regressions
- [ ] `npm run typecheck` passes — zero new errors
- [ ] Lint status declared: passes / known-fail (formatting-only debt, count stated)
- [ ] No unrelated files changed in the PR

### Issue linkage
- [ ] PR description contains `Closes #N`
- [ ] Issue was in **Ready** state when work started

### Tests
- [ ] Acceptance criteria from the issue all pass
- [ ] If the story touched a god node (see top-10 list in architectural report): characterization test was added **before** behavior change
- [ ] If the story removed a code path: regression test confirms removal is safe

### Verification
- [ ] Dev verification steps completed — outcome noted in PR
- [ ] Prod clean install smoke: completed / not required (reason stated)
- [ ] `/doctor` output captured before and after if runtime or install was impacted

### Release
- [ ] `Visible Behavior Changed`: yes / no — stated in PR
- [ ] `Install Impact`: none / install / update / uninstall / packaging / docs-only — stated in PR
- [ ] Version bump in `package.json` if required (see `RELEASE_PROCESS.md`)

### Rollback
- [ ] Rollback path documented in PR description

---

## God Nodes (require characterization test before any change)

These functions/classes have 20+ dependents. Adding a characterization test
before touching them is non-negotiable.

| Node | File | Edge count |
|---|---|---|
| `emitAndProject()` | `src/core/projector.ts` | 36 |
| `ccpBase()` | `src/ccp/ccp-events.ts` | 35 |
| `writeArtifact()` | `src/ccp/artifacts/io.ts` | 33 |
| `makeEnvelope()` | `src/ccp/artifacts/envelope.ts` | 32 |
| `taskArtifactPath()` | `src/ccp/task-paths.ts` | 27 |
| `runRemember()` | `src/ccp/commands/remember.ts` | 24 |
| `transitionTaskLifecycle()` | `src/ccp/commands/shared/task-lifecycle.ts` | 24 |
| `PiSession` | `src/pi/pi-session.ts` | 24 |
| `taskStatePath()` | `src/ccp/task-paths.ts` | 23 |
| `runGrill()` | `src/ccp/commands/grill.ts` | 23 |

---

## Known Debt (as of v1.6.1)

| Debt | Impact | Tracking |
|---|---|---|
| Lint: 173 Biome formatting errors | Non-blocking, style only | Lint is non-blocking in CI until cleaned |
| `scripts/verify_agent_os_bundle.py` references non-existent Python files | Bundle verifier broken | Tracked in RELEASE_PROCESS.md |
| `/review`, `/evaluate`, `/flow`, `/continue`, `/memory`, `/quick-task`, `/flight` have zero unit tests | No regression protection | Tracked in PI_RUNTIME_SMOKE_MATRIX.md |
| `bindProject()` not called at session_start | Authority gap | Tracked in architectural report |
