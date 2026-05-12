# Agent_OS v1 Release Checklist

_Last updated: 2026-05-11. Run this before tagging a release._

---

## Pre-release commands

```bash
# In Agent_OS repo:
npx tsc --noEmit                # 0 errors expected
npm test                        # 395+ passed, 0 failures expected

# In knowledge-brain repo:
uv sync --extra dev
uv run pytest tests/ -v         # 91+ passed, 0 skipped expected

# In agent-os-starter repo:
# (requires real Pi + brain install — run on dev machine, not CI)
bash smoke-test.sh              # all checks ok expected
```

---

## Checklist

| Item | Status | Notes |
|------|--------|-------|
| Starter single install path (`bash setup.sh`) | **Done** | Writes `install-manifest.json`; re-run safe; enforces Pi ≥v0.74.0 |
| Agent_OS Pi extension loads (`pi install ...`) | **Done** | Tested via Pi v0.74.0 |
| `/doctor` validates install | **Done** | Checks manifest, brain DB, project.yaml |
| `/init` initializes project | **Done** | Byte-exact governance files, valid project.yaml |
| `/flow <goal>` runs lifecycle | **Done** | Pause points at each gate; confirm before step |
| `/continue` resumes from any state | **Done** | Dispatches to correct next command |
| `/run` executes real shell commands | **Done** | `makeShellStepExecutor`, stdout/stderr/exit_code captured |
| `/verify` runs real verification commands | **Done** | `VerificationRecord` written; FAILED_RECOVERABLE on fail |
| `/review` produces durable artifact | **Done** | `ReviewRecord` written; UI-driven |
| `/evaluate` produces durable artifact | **Done** | `EvaluationRecord` written; criteria satisfaction rate |
| `/remember` stages then approves candidates | **Done** | Disk-durable; human approval before brain write |
| `/memory` recovers orphaned candidates | **Done** | Survives session restart; POLICY_DECISION emitted |
| Policy audit (POLICY_DECISION events) | **Done** | Emitted at every gate allow/block/escalate/approve/reject |
| Scope enforcement (expected_files) | **Done** | `extra_files_detected` → step fails; non-git → explicit label |
| `/status` shows state + next action + pending | **Done** | Includes memory candidate count + recovery command |
| `/flight` shows lifecycle timeline | **Done** | POLICY_DECISION, scope, verify, memory all visible |
| knowledge-brain integration | **Done** | `BrainClient.write` proven with real CLI in lifecycle test |
| install-manifest validated by doctor + smoke-test | **Done** | Required fields checked; actionable error on missing |
| Docs match implementation | **Done** | README updated to 16 commands; v1-readiness updated |
| TypeScript clean | **Done** | 0 errors |
| Tests prove product path | **Done** | `lifecycle.test.ts` — real shell, real scope, real verify, real brain |

---

## Known limitations accepted for v1

- No custom TUI — all output via `ctx.ui.notify` text. Sufficient for operator use.
- No web dashboard — `/flight` and `/status` cover observability.
- No Sandcastle/worktree sandbox — git checkpoint (stash/restore) is the safety net.
- No autonomous dreaming or reflection loop.
- LLM calls (grill, plan, review, evaluate) require interactive Pi session — not scriptable in CI.
- `expected_files` uses `git diff --name-only HEAD` — does not cover gitignore exceptions or bare repos.
- PolicyDecisionRecord per-task YAML export not yet implemented — events in `/flight` cover audit need.

---

## Version alignment

| Component | Current version / ref | Install method |
|-----------|----------------------|----------------|
| Agent_OS Pi extension | `v1.4.0` @ `algoSiliguri/Agent_OS` | `pi install git:github.com/algoSiliguri/Agent_OS@v1.4.0` |
| knowledge-brain | `v1.0.0` @ `agnivadc/knowledge-brain` | `uv tool install` |
| Pi coding agent | `v0.74.0+` minimum; `setup.sh` enforces this and records installed version in manifest | `npm install -g @earendil-works/pi-coding-agent` |
| Node.js | `20+` | system install |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

---

## How to tag

```bash
git tag -a v1.0.0 -m "Agent_OS v1.0.0 — stable release candidate"
git push origin v1.0.0
```

Update `setup.sh` in `agent-os-starter` to point to `@v1.0.0` before tagging that repo.

---

## Rollback / uninstall

```bash
# Remove Pi extension
pi uninstall agent-os    # or: pi remove git:github.com/algoSiliguri/Agent_OS

# Remove brain CLI
uv tool uninstall knowledge-brain

# Remove project data (irreversible)
rm -rf .agent-os/ data_store/
```

`.agent-os/` and `data_store/` are gitignored by default — check before deleting.

---

## v1.x roadmap

Short, realistic. In priority order:

1. **PolicyDecisionRecord artifact** — per-task YAML export of all policy decisions. Useful for offline audit and post-mortem.
2. **Stronger scope enforcement** — handle gitignore exceptions; detect file renames.
3. **Richer `/flight` grouping** — group events into labeled sections (phase transitions, policy, commands, scope, memory).
4. **office_github_copilot_workflow → workflow-pack** — convert the Copilot workflow bundle to an Agent_OS workflow pack so it can be imported via `loadWorkflowPacks`.
5. **Memory staleness / supersession** — mark older nodes as superseded when newer contradicting nodes are written.
6. **Dreaming / reflection loop** — offline background reflection after enough real event data accumulates. Not before v1.5.

---

## Version alignment (RC.1)

`knowledge-brain` pyproject.toml, `__init__.py`, and `brain --version` output are now all `1.0.0` — aligned with git tag `v1.0.0`. `brain --protocol-version` also returns `1.0.0`. All version signals agree.

`brain --version` now exits 0 (was: argparse error, exit 2). This unblocks `ensureBrainCli` which previously always reinstalled brain because the check always threw.

---

## Compatibility notes

- Agent_OS v1.x requires Pi v0.74.0+. Earlier Pi versions lack `registerCommand` and `on('tool_call')`.
- Agent_OS v1.x requires knowledge-brain v1.0.0+. Verified via `brain --version` (→ `knowledge-brain 1.0.0`) or `brain --protocol-version` (→ `1.0.0`).
- `data_store/knowledge.db` is SQLite — portable, no server required.
- `data_store/knowledge.jsonl` is the portable export — commit this to preserve memory across machines.
