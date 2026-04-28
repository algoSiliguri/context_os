# Agent OS — context_os

A control plane that governs AI coding sessions. Before an AI assistant does anything, it must verify a contract and declare itself `ACTIVE` or `NOT_ACTIVE`. Every action, approval, and state change is recorded in an append-only log.

Works with Claude Code, GitHub Copilot, OpenAI Codex, and any other AI coding assistant.

---

## What problem does this solve?

When you use an AI coding assistant, there is no reliable way to know:
- whether the AI is operating under your rules
- what it did during a session
- whether a critical action was approved before it ran

Agent OS solves this by requiring every session to bind to a governing contract before executing. If the contract check fails, the session is `NOT_ACTIVE` and nothing runs.

---

## How it works — the short version

```
Your project
  └── .agent-os.yaml          ← declares what this project is and what rules apply
  └── AGENT_OS_CONSTITUTION.md ← the governing contract (verified on every bind)
  └── .agent-os/
        └── runtime/
              ├── session.json   ← live session state
              └── events.jsonl   ← append-only event log
```

1. You run `context-os bind` from your project directory.
2. The runtime verifies the constitution file (hash, schema, contract index, directories).
3. If all checks pass → session is `ACTIVE`, a `BINDING` event is written to the log.
4. If any check fails → session is `NOT_ACTIVE`, the exact failing condition is shown.
5. While active, every state change and critical-action request is logged.
6. You can inspect state at any time with `context-os status`.

---

## Prerequisites

- **Python 3.12+** — check with `python3 --version`
- **uv** — fast Python package manager

Install `uv` if you don't have it:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## Quick Start

### Option A — New project using Agent OS as the runtime

```bash
git clone https://github.com/algoSiliguri/context_os.git my-agent-project
cd my-agent-project

# Install dependencies
uv sync

# Run bootstrap (sets up directories and MCP config)
bash bootstrap/bootstrap.sh --enable-mcp

# Bind the session
uv run context-os bind
```

### Option B — Add Agent OS to an existing project

```bash
# From inside your existing project
git submodule add https://github.com/algoSiliguri/context_os.git .agent-os

# Copy the manifest template and fill it in
cp .agent-os/config/.agent-os.yaml.template .agent-os.yaml
# Edit .agent-os.yaml — set project_id, name, and any critical actions

# Bind
uv --directory .agent-os run context-os bind
```

---

## CLI Reference

All commands run from the directory that contains `.agent-os.yaml`.

| Command | What it does |
|---|---|
| `context-os bind` | Verifies constitution and activates the session |
| `context-os status` | Shows current session state, approval queue, memory route |
| `context-os status --watch` | Live-refreshing status view (updates every few seconds) |
| `context-os doctor` | Checks your setup and tells you exactly what to fix |
| `context-os approve <hash>` | Approves a pending critical action |
| `context-os deny <hash> --reason <text>` | Denies a pending critical action |

### bind

```bash
uv run context-os bind
```

Expected output when everything is healthy:
```
BINDING ACTIVE
session_id: abc123...
project_id: my-project
conditions_verified: C1 C2 C3 C4 C5 C6 C7 C8 C11
```

If something fails, you see the exact condition:
```
BINDING NOT_ACTIVE
failed_condition: C4
detail: content-hash mismatch — constitution file may have been modified
```

### status

```bash
uv run context-os status
```

Shows a summary like:
```
MODE      active
PROJECT   my-project
STATE     ACTIVE
HEALTH    healthy
APPROVAL  none pending
MEMORY    global → ~/.knowledge-brain/knowledge.db
```

### doctor

```bash
uv run context-os doctor
```

The doctor checks everything and gives plain-language guidance:
```
✓ manifest .agent-os.yaml found and valid
✓ constitution file found
✓ content-hash verified (C4)
✓ contract-index hash verified (C8)
✓ constitution schema valid (C7)
✓ runtime directories readable/writable (C11)
⚠ telemetry schema not found (C10) — degraded binding, session still starts
✓ brain CLI available
```

---

## Memory

Agent OS routes persistent memory through [knowledge-brain](https://github.com/agnivadc/knowledge-brain). The AI writes what it learns; it reads it back next session.

Two scopes:

| Scope | Path | When to use |
|---|---|---|
| Global | `~/.knowledge-brain/knowledge.db` | Personal use — shared across all your projects |
| Project-local | `data_store/knowledge.db` | Team repos where memory should stay with the project |

Set global memory path in your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
export BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db"
```

Initialize global memory once:
```bash
uvx --from git+https://github.com/agnivadc/knowledge-brain.git \
  brain --db-path ~/.knowledge-brain/knowledge.db init
```

---

## Harness Setup

### Claude Code

Register the memory MCP server so Claude can read and write notes across sessions:

```bash
claude mcp add knowledge-brain \
  --scope user \
  --env BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db" \
  -- uvx --from git+https://github.com/agnivadc/knowledge-brain.git brain-mcp
```

Restart Claude Code. The tools `brain_write` and `brain_query` appear automatically.

### GitHub Copilot

`.github/copilot-instructions.md` is already present in the repo. In Copilot settings, enable MCP and point it at the same `brain-mcp` command above.

### OpenAI Codex / Pi

These read `AGENTS.md` directly. Memory works via the `brain` CLI (bash tool). Set `BRAIN_DB_PATH` in your shell profile — no extra config needed.

---

## Verifying the bundle

```bash
python3 scripts/verify_agent_os_bundle.py
```

Pass = everything is in place. Fail = the exact line tells you what is missing or mismatched.

---

## What each file does

| File / directory | Purpose |
|---|---|
| `AGENT_OS_CONSTITUTION.md` | The governing contract. Hash-verified on every bind. |
| `.agent-os.yaml` | Your project's manifest — identity, memory scope, critical actions. |
| `.agent-os/runtime/session.json` | Current session state snapshot. |
| `.agent-os/runtime/events.jsonl` | Append-only log of every event in the session. |
| `context_os_runtime/` | Python runtime — binding, CLI, doctor, event builders. |
| `bootstrap/` | One-time setup scripts. |
| `scripts/` | Utility scripts (hash computation, bundle verification). |
| `execution/` | Skills, protocols, and permission manifests. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `uv: command not found` | uv not installed | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `BINDING NOT_ACTIVE — failed_condition: C4` | Constitution file was modified | Run `python3 scripts/compute_constitution_hash.py` and update the `content-hash` in the B0 header |
| `BINDING NOT_ACTIVE — failed_condition: C8` | `contracts/index.json` changed | Run `python3 scripts/generate_contract_index.py` to regenerate |
| `BINDING NOT_ACTIVE — failed_condition: C11` | Runtime directories missing or not writable | Run `bash bootstrap/bootstrap.sh` |
| `brain_write` / `brain_query` missing in Claude Code | MCP server not registered | Run the `claude mcp add` command above, then restart Claude Code |
| `brain_query` returns nothing for data you saved | CLI and MCP point at different DBs | Check that `BRAIN_DB_PATH` is the same path everywhere |
| `context-os: command not found` | Dependencies not installed | Run `uv sync` first |
| First `uvx` run is slow | Downloading and caching the package | Subsequent runs are fast (cache at `~/.cache/uv/`) |

---

## Current status

| Area | Done | What works | What's next |
|---|---:|---|---|
| Foundation | 85% | Bind, lock, approval, event log, constitution verification | Capability-token enforcement |
| Visibility | 100% | `status`, `status --watch`, `doctor`, heartbeat, degraded-binding report | Complete |
| Enforcement | 35% | Action hash, approve/deny flow, namespace guard | Generic execution gate |
| Orchestration | 10% | Skill registry docs exist | Runtime skill execution |
| Productization | 10% | CLI exists | One-command guided setup |

See [AGENT_OS_ROADMAP.md](./AGENT_OS_ROADMAP.md) for the detailed ticket list.

---

## Related repos

- [knowledge-brain](https://github.com/agnivadc/knowledge-brain) — the persistent memory layer
- [brain_playground](https://github.com/agnivadc/brain_playground) — a reference consumer repo showing the full bundle in action
