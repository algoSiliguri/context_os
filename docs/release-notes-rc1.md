# Agent_OS v1.0.0-RC.1 Release Notes

_Released: 2026-05-12_

---

## What this release is

Release Candidate 1. Backend lifecycle is production-quality. Install path is hardened. All 488 tests pass across Agent_OS (395) and knowledge-brain (93). Ready for dogfood and external RC validation.

**Not yet v1.0.0 final.** The RC period exists to catch install friction and real-world edge cases before the final tag.

---

## What is included

### Backend lifecycle (all production-quality)

- **`/flow <goal>`** — full grill→plan→run→verify→review→evaluate lifecycle with confirm gates at each step
- **`/continue`** — state-aware resume from any interrupted state
- **`/run`** — real shell execution via `execFile`; stdout/stderr/exit_code/duration captured per command
- **`/verify`** — real shell verification commands; `VerificationRecord` written; `FAILED_RECOVERABLE` on failure
- **`/grill`** — 7-question fixed sequence (assumption×2, risk×2, constraint, success_criterion, evidence); stops on "done"
- **`/plan`** — skeleton plan drafted; shown with command count and ⚠ warning on empty steps; human approval required
- **`/review`** — human-driven review record; blocks on FAIL/BLOCKED
- **`/evaluate`** — criteria satisfaction rate scored; lifecycle completes
- **`/remember`** — stages memory candidates; requires per-candidate human approval before brain write
- **`/memory`** — recovers orphaned memory candidates after interrupted session
- **`/status`** — operator card: task ID, state, next action, pending memory count + recovery command
- **`/flight`** — full lifecycle timeline including PolicyDecision events, scope checks, verify result, memory operations
- **`/init`** — governance files, project.yaml, runtime dirs, .gitignore; idempotent with `--upgrade`
- **`/doctor`** — validates constitution, project.yaml, brain DB, install manifest

### Safety and governance

- **Hard phase gates** — `requireTaskState` blocks all transitions; wrong state = error, not silent skip
- **PolicyDecision events** — `POLICY_DECISION` emitted at every gate allow/block/escalate/approve/reject
- **expected_files enforcement** — git delta post-step; `extra_files_detected` → step fails with `scope_violation`
- **Git checkpoint** — `git stash` before `/run`, restore on failure
- **Memory staging** — disk-durable `pending-captures.yaml`; survives process crash

### Install / onboarding

- **Single install path**: `bash setup.sh` installs brain CLI + Pi extension; writes `install-manifest.json`
- **Pi version enforced**: setup.sh fails hard if Pi < v0.74.0 with exact upgrade command
- **uv PATH recovery**: setup.sh warns + recovers if `brain` not on PATH after `uv tool install`
- **Smoke test**: `bash smoke-test.sh` validates all components without mutating state

### UI / operator experience

- **State-aware session_start**: guides to `/init` if uninitialized; shows active task + `/continue` hint; `/flow` if no task
- **Plan approval warning**: shows command count per step; ⚠ if no commands — tells operator to edit plan.yaml before approving
- **Post-plan path hint**: plan.yaml path shown in approval/rejection notify

---

## Install flow

```bash
# Prerequisites (once per machine)
npm install -g @earendil-works/pi-coding-agent   # Pi v0.74.0+
export ANTHROPIC_API_KEY=sk-ant-...

# Project setup
git clone https://github.com/algoSiliguri/agent-os-starter my-project
cd my-project
bash setup.sh

# Initialize (inside Pi)
pi
> /init
> /doctor
> /flow "your first goal"
```

---

## Test evidence

```
TypeScript typecheck (Agent_OS):
  npx tsc --noEmit → 0 errors

Agent_OS tests:
  npm test → 395 passed, 0 failed (80 test files)
  Includes: lifecycle.test.ts — real shell, real scope, real verify, real brain write

knowledge-brain tests:
  uv run pytest tests/ -v → 93 passed, 0 failed
  Includes: TestVersion — brain --version and --protocol-version behavior

Shell syntax:
  bash -n setup.sh → ok
  bash -n smoke-test.sh → ok
```

---

## Known limitations (accepted for v1)

| Limitation | Impact | Workaround |
|---|---|---|
| `defaultPlanDrafter` produces skeleton with empty commands | Plan needs manual editing before /run does real work | Warning shown at approval time; edit `.agent-os/tasks/<id>/plan.yaml` |
| 7-question fixed grilling (not LLM-adaptive) | Same questions regardless of goal type | Answer "done" to stop early; v1.x will add adaptive grilling |
| No Sandcastle/worktree sandbox | `/run` executes in working directory | git checkpoint (stash/restore) is the safety net |
| Pi extension globally installed (one version per machine) | Multi-project version isolation not possible | Document expected version per project in v1.x |
| No autonomous plan/grill (LLM-backed) | Developer must fill in plan commands | By design: governance-first, not autonomous executor |
| No web dashboard | All output via `ctx.ui.notify` text | `/status` and `/flight` cover observability |
| `brain --version` (new in this RC) previously returned error | `ensureBrainCli` always reinstalled brain even when present | Fixed in this release |

---

## Breaking changes from prior development builds

None. This is the first public RC. No migration required.

---

## Version alignment

| Component | Version |
|---|---|
| Agent_OS Pi extension | v1.4.0 |
| knowledge-brain | v1.0.0 |
| Pi minimum | v0.74.0 |

See `docs/compatibility.md` for full matrix and upgrade path.

---

## Upgrade / reset caveats

- **Upgrading Agent_OS**: update `AGENT_OS_EXTENSION` in `setup.sh`, re-run `bash setup.sh`, then `/init --upgrade` inside Pi. `project.yaml` is preserved. Governance files are refreshed.
- **Upgrading knowledge-brain**: update `BRAIN_GIT_URL` in `setup.sh`, re-run. DB schema is forwards-compatible within v1.x.
- **Resetting a project**: `rm -rf .agent-os/ data_store/` then `/init`. All task history and memory are lost — verify backup of `data_store/knowledge.jsonl` first.
- **Removing global install**: `pi uninstall agent-os && uv tool uninstall knowledge-brain`. Affects all projects on this machine.

---

## v1.x roadmap (post-RC)

1. `brain --version` doctor check (now unblocked — version scheme aligned)
2. Doctor checks Pi extension version/source from `pi ext list`
3. `setup.sh --dry-run`
4. LLM-backed plan drafter (via PlanDrafter interface)
5. LLM-backed adaptive question generator
6. PolicyDecisionRecord per-task YAML export
7. Richer `/flight` grouping with phase labels
