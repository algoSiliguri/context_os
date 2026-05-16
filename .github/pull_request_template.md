# Pull Request

## Closes
<!-- Required. Link the issue: Closes #N -->
Closes #

## What changed
<!-- One paragraph. What does this PR do? -->

## Why
<!-- One sentence. What problem does this solve? -->

---

## Definition of Done Checklist

### Code
- [ ] `npm test` passes — no regressions
- [ ] `npm run typecheck` passes — no new errors
- [ ] Lint: `npm run lint` — [ ] passes / [ ] known-fail (formatting only, documented)
- [ ] No unrelated files changed

### Tests
- [ ] Tests added or updated per issue's "Tests Required" field
- [ ] If story touched a god node: characterization test added BEFORE behavior change
- [ ] If story removed a code path: regression test confirms it stays removed

### Verification
- [ ] Dev verification steps from issue completed — result: **pass / skip (reason: )**
- [ ] Prod clean install smoke — [ ] completed / [ ] not required (reason: )
- [ ] `/doctor` output captured if runtime or install impacted — [ ] captured / [ ] not required

### Release
- [ ] `Visible Behavior Changed` declared: **yes / no**
- [ ] `Install Impact` declared: **none / install / update / uninstall / packaging / docs-only**
- [ ] Version bump needed: **yes / no** (if yes, bumped in `package.json`)

### Rollback
<!-- How to revert this PR if it causes a regression post-merge. -->

---

## Notes
<!-- Anything a reviewer or future contributor needs to know. -->
