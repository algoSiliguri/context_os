# Dev vs Prod Environment Model

Agent_OS development happens on the same laptop that runs it as a user.
This guide prevents the two environments from contaminating each other.

---

## Dev Environment

**Meaning:** active source checkout. Can be dirty. For developing and testing
source changes.

```
~/Documents/GitHub/Agent_OS/          ← source repo
~/Documents/GitHub/Agent_OS/.agent-os/ ← DEV runtime state (do not use in prod smoke)
```

Pi loads the extension via the `"pi"` field in `package.json`:
```json
"pi": { "extensions": ["src/pi/extension.ts"] }
```

Run `pi` from inside the repo root, or from a test project where this repo
is installed locally. Source changes are reflected immediately.

**Allowed in dev only:**
- Dirty working tree, uncommitted changes
- `npm link` or local path installs
- In-progress feature branches
- Using `.agent-os/` inside the repo as runtime state

**Never use dev `.agent-os/` to validate prod install behavior.** It contains
state from source development runs, not a clean install.

---

## Prod (Clean Install Smoke) Environment

**Meaning:** no connection to source checkout. Simulates a real user who
installed Agent_OS via `agent-os-starter`. Must be fully isolated.

### Directory convention

```
/tmp/agent-os-prod-smoke/<timestamp>/
  sample-project/          ← fresh user project; run /init and /doctor here
  install-home/            ← isolated home dir for any global installs
```

Always use a **new timestamp subdirectory** for each smoke run. Never reuse
a previous run's directory.

```bash
# Create fresh smoke environment
TS=$(date +%Y%m%dT%H%M%S)
mkdir -p /tmp/agent-os-prod-smoke/$TS/sample-project
cd /tmp/agent-os-prod-smoke/$TS/sample-project
```

**Files allowed in prod smoke only:**
- The temporary directory above
- A fresh `project.yaml` created by `/init`
- Clean `data_store/knowledge.db`

**Files that must never be shared between dev and prod:**
- `.agent-os/` directory — dev and prod each get their own
- `node_modules/` — prod smoke uses `npm ci`, never dev's node_modules
- `.env` or API keys — must not appear in any tracked path

---

## Source Mode Detection

`/doctor` reports whether the extension loaded from source or an installed package.

`src/core/doctor.ts:inferSourceMode()` returns: `source` | `installed` | `unknown`

**Rule:** If prod smoke shows `source` in `/doctor` output, the test is invalid.
It means the prod environment is accidentally reading from the source checkout.

---

## The False Confidence Trap

Running `npm test` and `npm run dev:smoke` from source only proves the
**source** works. It does not prove:

| What it misses | Why it matters |
|---|---|
| `agent-os-starter` install flow works | Users install via starter, not npm |
| Governance files copy correctly to fresh project | `init-governance-bytes.test.ts` catches some of this, but only from source |
| Pack version detection works post-install | Requires installed binary path |
| `/doctor` shows `installed` not `source` | Source mode taints all prod claims |
| `/init` in a fresh directory produces expected state | Source `.agent-os/` can mask failures |

**The prod smoke environment is the only way to catch these gaps.**

---

## Prod Smoke: Manual Steps (Current)

Until `scripts/smoke/` contains an automated script, follow these steps manually
before any release or install-impacting story.

```bash
# 1. Create fresh environment
TS=$(date +%Y%m%dT%H%M%S)
mkdir -p /tmp/agent-os-prod-smoke/$TS/sample-project
cd /tmp/agent-os-prod-smoke/$TS/sample-project

# 2. Initialize a fresh git repo (Agent OS requires a git project)
git init && git commit --allow-empty -m "init"

# 3. Install Agent OS (update the tag/path to the version under test)
# Option A — from local build (dev channel):
#   Configure Pi to load from source path

# Option B — from stable tag:
#   Follow agent-os-starter setup.sh

# 4. Run Pi and execute:
#   /init
#   /doctor
#
# 5. Verify:
#   - /doctor shows status: ok
#   - /doctor shows source_mode: installed  (not "source")
#   - .agent-os/project.yaml exists
#   - .agent-os/runtime/ exists
#   - No errors in Pi output

# 6. Record result in PR description
```

See `scripts/smoke/README.md` for the full verification checklist and future
automation design.

---

## dev:smoke Script Limitation

`scripts/dev-smoke.ts` (`npm run dev:smoke`) requires three sibling repos:
- `Agent_OS/`
- `agent-os-starter/`
- `knowledge-brain/`

It **cannot run in isolation** or in CI. It is a developer convenience tool
only. It does not substitute for prod clean install smoke.
