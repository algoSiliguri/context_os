# Release Process

## Channels

| Channel | Audience | Install method | Version format |
|---|---|---|---|
| `dev` | Source developer only | `npm install` + local Pi extension path | branch HEAD |
| `beta` | Opt-in testers | `git clone @<rc-tag>` via agent-os-starter | `vX.Y.Z-rc.N` |
| `stable` | All users | agent-os-starter → `setup.sh` | `vX.Y.Z` |

---

## SemVer Policy

| Change type | Bump | Examples |
|---|---|---|
| Bug fix, internal hardening, docs, test additions | `patch` (Z) | fix writeArtifactRaw, add characterization test, doc update |
| New slash command, new config field, new observable behavior | `minor` (Y) | add /quick-task, add BINDING event, new /doctor check |
| Breaking install or runtime behavior, removed command, schema change | `major` (X) | remove command, breaking artifact schema, breaking .agent-os/ layout |

---

## Pre-Release Checklist

Run every item before tagging a release. Capture outputs.

### Code health
- [ ] `git status` — working tree clean
- [ ] `npm test` — all tests pass, zero failures
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — result recorded (pass or known-fail count)

### Smoke tests
- [ ] `npm run dev:smoke` — passes (requires sibling repos; see DEV_PROD_ENVIRONMENTS.md)
- [ ] Prod clean install smoke completed per `DEV_PROD_ENVIRONMENTS.md`
  - [ ] `/init` completes without error
  - [ ] `/doctor` shows `status: ok`
  - [ ] `/doctor` shows `source_mode: installed` (not `source`)

### Version
- [ ] Version bumped in `package.json` per SemVer policy above
- [ ] `docs/release-notes-vX.Y.Z.md` created
- [ ] `/doctor` output captured — confirms reported version matches `package.json`

### Bundle verifier
> **Known debt:** `scripts/verify_agent_os_bundle.py` references
> `context_os_runtime/authority.py`, `context_os_runtime/runtime_paths.py`,
> `context_os_runtime/session_store.py` — these Python files do not exist in
> this repo. The bundle verifier **will fail if run**. Do not run it until
> STORY for fixing stale Python refs is resolved.
>
> TypeScript bundle verification via `scripts/dev-smoke.ts` is the current
> substitute for bundle integrity checking.

### Release
- [ ] Git tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] `agent-os-starter` updated to target new tag
- [ ] CHANGELOG updated (or new release notes file linked)

---

## How to Create a Beta Candidate

```bash
# 1. All planned stories for the milestone in Done
# 2. Run full pre-release checklist above
# 3. Tag as release candidate
git tag v1.7.0-rc.1
git push origin v1.7.0-rc.1

# 4. Update agent-os-starter to point to rc tag for testing
# 5. Run prod smoke against the rc tag
# 6. If clean, promote to stable
```

## How to Promote Beta to Stable

```bash
git tag v1.7.0
git push origin v1.7.0
# Update agent-os-starter to point to stable tag
```

## How to Rollback

Tags are immutable. To rollback: update `agent-os-starter` to point to
the previous stable tag. No code changes required.

```bash
# Previous stable was v1.6.1
# Update agent-os-starter target back to v1.6.1
```

---

## Version Verification in /doctor

`src/core/versioning.ts:resolveRuntimeVersion()` reads version from `package.json`.
`src/pi/extension-helpers.ts:readExtensionVersion()` also reads `package.json`.

Before tagging: run `/doctor` and confirm the version line matches the tag you
are about to create. If it shows a different version, the `package.json` bump
was not committed.

---

## Source Mode vs Installed Mode

`src/core/doctor.ts:inferSourceMode()` returns `source` | `installed` | `unknown`.

- `source` = extension loaded from repo checkout (dev mode)
- `installed` = extension loaded from installed package (prod mode)

A release is only valid if prod smoke shows `installed`.
