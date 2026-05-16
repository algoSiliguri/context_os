# Prod Clean Install Smoke

This directory is for prod environment smoke testing scripts.

Prod smoke verifies that Agent_OS works as a **user would install it** —
not from source, not from dev node_modules, but from a clean install
into a fresh project.

See `docs/DEV_PROD_ENVIRONMENTS.md` for the full rationale.

---

## Current Status

No automated script exists yet. Use the manual steps below.

Tracked in: STORY-009 (Add Clean Prod Install Smoke Script Design)

---

## Manual Prod Smoke Steps

Run before every release or any story with `Install Impact: install / update / uninstall`.

```bash
# 1. Create fresh isolated environment
TS=$(date +%Y%m%dT%H%M%S)
SMOKE_DIR="/tmp/agent-os-prod-smoke/$TS"
PROJECT_DIR="$SMOKE_DIR/sample-project"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# 2. Init a fresh git project (Agent OS requires git)
git init
git commit --allow-empty -m "init"

# 3. Install Agent OS targeting the version under test
# Option A: stable/beta tag via agent-os-starter
#   git clone https://github.com/algoSiliguri/agent-os-starter.git "$SMOKE_DIR/starter"
#   cd "$SMOKE_DIR/starter" && bash setup.sh
#
# Option B: local dev build (use for pre-tag testing)
#   Configure Pi to load from source path

# 4. Run Pi and execute these commands in order:
#   /init
#   /doctor

# 5. Verify all of the following:
echo "CHECKLIST:"
echo "[ ] /init completed without error"
echo "[ ] /doctor shows: status: ok"
echo "[ ] /doctor shows: source_mode: installed  (NOT 'source')"
echo "[ ] /doctor shows version matching the release tag"
echo "[ ] .agent-os/project.yaml exists"
echo "[ ] .agent-os/contracts/index.json exists"
echo "[ ] .agent-os/schemas/*.json all exist"
echo "[ ] data_store/ created"
echo "[ ] No unexpected errors in Pi output"

# 6. Record result
echo "Smoke result: PASS/FAIL"
echo "Version: "
echo "Source mode: "
echo "Date: $TS"
```

---

## What This Smoke Tests

| Check | Why it matters |
|---|---|
| `/init` completes cleanly | Install flow works end-to-end |
| `/doctor` shows `ok` | All constitution, pack, brain checks pass |
| `source_mode: installed` | Confirms prod install, not dev source |
| Version matches tag | `package.json` version was committed correctly |
| Governance files present | Bundled files copied correctly |
| `data_store/` created | Brain CLI installed and seeded |

---

## What This Does NOT Test

- Full workflow commands (grill/plan/run) — covered by unit/integration tests
- Brain query/write operations — requires brain CLI and API key
- Multi-project isolation — separate smoke run per project

---

## Future Automation Requirements

A future `scripts/smoke/prod-install.sh` should:

1. Accept `--version <tag>` argument
2. Create timestamped temp directory automatically
3. Install Agent OS from the specified version
4. Run `/init` and `/doctor` headlessly (requires Pi headless mode or test harness)
5. Assert expected outputs programmatically
6. Print PASS/FAIL with captured outputs
7. Clean up temp directory on success (preserve on failure for debugging)
8. Exit non-zero on any failure (suitable for CI)

Blocked on: Pi headless invocation mechanism. Track in follow-up story.

---

## Why dev:smoke Does Not Substitute

`npm run dev:smoke` (`scripts/dev-smoke.ts`) requires:
- `Agent_OS/`, `agent-os-starter/`, `knowledge-brain/` all as sibling directories
- Source checkout access

It cannot run in CI. It does not verify installed mode. It does not test
the `agent-os-starter` install flow.
