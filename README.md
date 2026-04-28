# Agent OS

AI session governance and persistent memory - works in Pi, Claude Code, Copilot, and Codex.

Clone it into your project, run bootstrap, and open your harness. Every session starts
by declaring itself `ACTIVE` or `NOT_ACTIVE` before doing anything else. Skills load
on demand. Memory persists across sessions.

## Prerequisites

- `python3`
- `uvx` - install: `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Quick Start

```bash
# 1. Get Agent OS (new project)
git clone <repo> my-project
cd my-project

# 1. Or add to an existing project
git submodule add <repo> .agent-os

# 2. Initialize memory (one-time, global across all your projects)
uvx --from git+https://github.com/agnivadc/knowledge-brain.git \
  brain --db-path ~/.knowledge-brain/knowledge.db init

# 3. Run bootstrap
bash bootstrap/bootstrap.sh --enable-mcp
```

## What You Get

- Every AI session emits a `BINDING` event - `ACTIVE` or `NOT_ACTIVE` - before doing anything else
- Skills load on demand when triggered by keywords in your request
- Memory persists across sessions: the AI writes what it learns, reads it back next time

## Harness Setup

### Pi (primary) - no extra config
Pi reads `AGENTS.md`. Memory works via the `brain` CLI (bash tool). Nothing else to do.
Set `BRAIN_DB_PATH` in your shell profile:
```bash
export BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db"
```

### Claude Code
```bash
claude mcp add knowledge-brain \
  --scope user \
  --env BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db" \
  -- uvx --from git+https://github.com/agnivadc/knowledge-brain.git brain-mcp
```
Restart Claude Code. The tools `brain_write` and `brain_query` appear automatically.

### Copilot
`.github/copilot-instructions.md` is already present. Enable MCP in Copilot settings and
configure the `knowledge-brain` server with the same `brain-mcp` command above.

### Codex
Codex reads `AGENTS.md`. Memory works via the `brain` CLI (bash tool). Same setup as Pi.

## Memory

| Scope | Path | When to use |
|---|---|---|
| Global (recommended) | `~/.knowledge-brain/knowledge.db` | Personal use - shared across all projects |
| Project-scoped | `data_store/knowledge.db` | Teams sharing a DB committed to the repo |

Check what's stored:
```bash
brain --db-path $BRAIN_DB_PATH list
```

## Verify the Bundle

```bash
python3 scripts/verify_agent_os_bundle.py
```

Pass = ready. Fail = the exact line tells you what's missing or mismatched.

## Runtime Binding

Each consumer repo becomes Agent-Ready by adding a `.agent-os.yaml` manifest.
The central `context_os` runtime binds that repo, resolves a runtime version,
builds a session binding record, mounts memory namespaces, and enforces
deterministic state transitions through append-only event logging.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `uvx: command not found` | `uv` not installed | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Session starts with `NOT_ACTIVE` | Constitution binding failed | Run `python3 scripts/verify_agent_os_bundle.py` - it will name the failing check |
| `brain_query` returns nothing for known data | CLI and MCP point at different DBs | Ensure `BRAIN_DB_PATH` is the same absolute path everywhere |
| `brain_write` / `brain_query` missing in Claude Code | MCP server not registered | Run the `claude mcp add` command above, then restart Claude Code |
| First `uvx` run is slow | Downloading and caching the package | Subsequent runs are fast (cache: `~/.cache/uv/`) |
