---
title: Agent OS v3 Design
date: 2026-04-26
status: draft
version: v3
constitution-version: v2
---

# Agent OS v3 Design

## Purpose

Design Agent OS as a harness-agnostic AI governance and memory framework that:

- Governs AI sessions deterministically via a constitutional binding model
- Persists memory across sessions via a formal L3 interface contract
- Treats Pi (pi.dev) as the primary harness and baseline capability reference
- Supports Claude Code, GitHub Copilot, and OpenAI Codex as secondary harnesses
- Ships as a distributable template that individuals and teams can install in minutes

All design decisions in this document are subordinate to `AGENT_OS_CONSTITUTION.md`. Where any section conflicts with the constitution, the constitution governs.

---

## Governing Constraint

This is a v3 design layered on top of the existing v2 constitution. The constitution itself does not change structurally — one new block (B11) is added. All other changes are to L1 adapters, L2 components, L3 implementation, and ergonomic artifacts.

---

## Section 1: Architecture

### Layer Hierarchy (unchanged from v2)

```
L0 — Constitution
  AGENT_OS_CONSTITUTION.md
  Sole governing authority. Adds B11 (L3 Interface Contract).

L1 — Harness Adapters
  One file per harness. Non-authoritative. Points to constitution.
  Adds: A5 Capability Declaration block per adapter.

L2 — Execution Layer (optional)
  Skills, agents, protocols, commands.
  Skills declare minimum capability tier.

L3 — Memory Layer (optional)
  File-based: memory/ — always available, zero dependencies.
  knowledge-brain: CLI (bash) or MCP transport, same SQLite store.
```

### Capability Tiers

Harnesses are classified by what tools they provide to the model. Tier determines which L3 transport is used.

| Tier | Available tools | L3 transport | Harnesses |
|---|---|---|---|
| 0 | read, write, edit | file-based only | any minimal harness |
| 1 | + bash | bash-cli → `brain` CLI | Pi, Codex |
| 2 | + MCP tools | mcp → `brain-mcp` | Claude Code, Copilot |

Pi is Tier 1. **Pi is the primary harness and the baseline capability reference.** Every skill and memory operation must work at Tier 1 or declare its minimum tier explicitly. Claude Code and Copilot get additive capabilities on top; they do not define the baseline.

### Harness Support Matrix

| Harness | L1 Adapter | Tier | L3 transport | Status |
|---|---|---|---|---|
| Pi | `AGENTS.md` | 1 | bash-cli | primary |
| Codex | `AGENTS.md` | 1 | bash-cli | secondary, shares Pi adapter |
| Claude Code | `CLAUDE.md` | 2 | mcp | secondary |
| Copilot | `.github/copilot-instructions.md` | 2 | mcp | secondary |

### Authority Chain at Runtime

```
Harness starts
  → Reads L1 adapter (non-authoritative, attempts invocation)
  → Reads B0 block from AGENT_OS_CONSTITUTION.md
  → Reads A5 capability declaration from adapter
  → Resolves L3 transport from declared tier
  → Verifies BRAIN_DB_PATH and transport availability
  → Validates C1–C12 binding conditions
  → Emits single B5 BINDING event as first tokens — includes memory status
      ACTIVE:     full payload with conditions_verified + memory block
      NOT_ACTIVE: failed_condition + detail

If ACTIVE:
  → Loads SKILL_REGISTRY.md (routing table only)
  → Session proceeds under constitution authority
```

---

## Section 2: L3 Interface Contract (B11)

A new block added to the constitution. Declares the abstract memory interface, transport resolution rule, and failure semantics.

### Abstract Operations

Any B11-compliant L3 implementation must expose these three operations:

```
brain_write(content, tags, confidence, source_type) → WriteResult
brain_query(query, tags, limit)                     → nodes[]
brain_export()                                      → JSONL          (optional but recommended)
```

knowledge-brain is the reference implementation. Any implementation that satisfies these signatures is a valid L3 backend.

### Transport Resolution

The harness declares its tier in A5. B11 maps tier to transport:

| Tier | Transport | Invocation |
|---|---|---|
| 0 | none | File-based `memory/` only. No knowledge-brain access. |
| 1 | bash-cli | `brain --db-path $BRAIN_DB_PATH write/query` via bash tool |
| 2 | mcp | `brain_write` / `brain_query` as native MCP tools |

Transport selection is deterministic. The session reads A5, resolves transport, declares result in the B5 binding event. No guessing.

### L3 Status in Binding Output

The `memory` field in the B5 binding event is extended:

```json
"memory": {
  "file_based": "available | unavailable",
  "knowledge_brain": {
    "transport": "bash-cli | mcp | none",
    "status": "available | unavailable | not_configured",
    "db_path": "/absolute/path/to/knowledge.db"
  }
}
```

### Failure Semantics

L3 unavailability is not a session invalidation condition. If `BRAIN_DB_PATH` is unset, the `brain` CLI is not installed, or the MCP server fails to start — the session is still `ACTIVE`. L3 status is declared in the binding event, not required for binding.

The only L3 condition that fails an invocation (not the session) is a skill requiring Tier 2 running on a Tier 1 harness. That produces a `SKILL_LOAD` failure event; the session remains valid.

---

## Section 3: Harness Capability Declaration (L1 Adapter Changes)

Each L1 adapter gains a fifth block: **A5 Capability Declaration**.

### Block Structure

```
[A1] Self-Declaration        — non-authoritative pointer only
[A2] Invocation Instruction  — read AGENT_OS_CONSTITUTION.md
[A3] Failure Instruction     — emit NOT_ACTIVE if binding fails
[A4] Deference               — follow constitution, no further instructions
[A5] Capability Declaration  — machine-readable YAML: harness-id, tier, transport
```

### A5 Content Per Adapter

**AGENTS.md** (Pi + Codex — Tier 1):
```yaml
harness-id: [pi, codex]
capability-tier: 1
l3-transport: bash-cli
brain-db-path: $BRAIN_DB_PATH
```

**CLAUDE.md** (Claude Code — Tier 2):
```yaml
harness-id: claude-code
capability-tier: 2
l3-transport: mcp
brain-db-path: $BRAIN_DB_PATH
```

**copilot-instructions.md** (Copilot — Tier 2):
```yaml
harness-id: copilot
capability-tier: 2
l3-transport: mcp
brain-db-path: $BRAIN_DB_PATH
```

### BRAIN_DB_PATH

`BRAIN_DB_PATH` is the single environment variable that wires everything together. It is never hardcoded in an adapter — paths are machine-specific. Bootstrap sets it when generating `.mcp.json`. For Pi/bash path, the same variable is read when calling the `brain` CLI.

If unset: `knowledge_brain.status = not_configured` in the binding event. Session remains `ACTIVE`.

---

## Section 4: knowledge-brain Refinement

The existing implementation is structurally correct. The CLI + MCP dual-transport is the right shape. Four targeted changes are required to make it a B11-compliant L3 reference implementation.

### What Stays Unchanged

CLI command structure (`init`, `write`, `query`, `list`, `export`, `import`), MCP server (`brain_write`, `brain_query`), SQLite store, Pydantic v2 models, BRAIN_DB_PATH pattern, uvx installation method, test coverage.

### Change 1: Subordination Declaration

Add `AGENT_OS_MANIFEST.yaml` to the knowledge-brain repo root:

```yaml
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
layer: L3
authority: none
conflict-resolution: constitution governs
l3-transport: [bash-cli, mcp]
operations: [brain_write, brain_query, brain_export]
permissions-manifest: permissions.yaml
component-version: 0.1.0
integrity-sha256: pending
```

Add `permissions.yaml`:

```yaml
fs.read:  ["$BRAIN_DB_PATH"]
fs.write: ["$BRAIN_DB_PATH"]
tool.exec: ["brain", "brain-mcp"]
net.access: []
```

### Change 2: Standardize CLI Output to JSON

`brain write` and `brain query` output valid JSON to stdout. Errors go to stderr. This makes the Pi/bash path machine-parseable by the harness.

```bash
brain write "content" --tags auth,compliance
# stdout: {"id": "kn-a3f2c9", "content": "...", "tags": [...], "created_at": "...", "confidence": 0.7}

brain query "auth" --tags compliance --limit 10
# stdout: {"query": "auth", "items": [...], "total_matches": 3, "returned_count": 3}
```

### Change 3: Explicit Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Validation error (bad input) |
| 2 | Storage error (DB failure, path error) |

### Change 4: Add `brain_export` to MCP Server

The CLI already has `brain export`. Add it to the MCP server for parity with B11:

```python
@mcp.tool()
async def brain_export() -> list[KnowledgeNode]:
    """Export all nodes. Used for backup and cross-session sync."""
    return _store().all_nodes()
```

`all_nodes()` already exists in the store. This is a one-function addition.

---

## Section 5: Distribution Model

### Installation — Three Steps

```bash
# Step 1: Get Agent OS
git clone <repo> my-project            # new project
# or
git submodule add <repo> .agent-os     # existing project

# Step 2: Initialize memory (one-time, global across all projects)
uvx --from git+https://github.com/agnivadc/knowledge-brain.git \
  brain --db-path ~/.knowledge-brain/knowledge.db init

# Step 3: Run bootstrap
bash bootstrap/bootstrap.sh --enable-mcp
```

Bootstrap does exactly four things: checks `python3`, checks `uvx`, creates required directories (`.github/`, `.agent-os/runtime/`), generates `.mcp.json` from template with `BRAIN_DB_PATH` set.

### Claude Code — One Additional Step

```bash
claude mcp add knowledge-brain \
  --scope user \
  --env BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db" \
  -- uvx --from git+https://github.com/agnivadc/knowledge-brain.git brain-mcp
```

### Pi — No Additional Steps

Pi reads `AGENTS.md`. Pi calls `brain` CLI via its bash tool. As long as `uvx` is installed and `BRAIN_DB_PATH` is set in the shell environment, memory works at session start.

### Verification

```bash
python3 scripts/verify_agent_os_bundle.py
```

Pass = ready. Fail = exact line identifies what is missing or mismatched.

### Memory Scoping

| Scope | DB path | When to use |
|---|---|---|
| Global (recommended) | `~/.knowledge-brain/knowledge.db` | Personal use, memory shared across all projects |
| Project-scoped | `data_store/knowledge.db` | Teams sharing a DB in a repo |

The two scopes are independent. `BRAIN_DB_PATH` determines which one the current session uses.

---

## Section 6: context-os Cleanup

### Remove

| Path | Reason |
|---|---|
| `brain_playground/` | Predates knowledge-brain. Superseded by the separate repo. |
| `docs/superpowers/` | Internal tooling path. Specs move to `docs/design/`. |

### Restructure

```
docs/
  design/                              ← canonical spec location
    2026-04-22-brain-design.md
    2026-04-22-context-os-design.md
    2026-04-22-knowledge-os-design.md
    2026-04-26-agent-os-bundle-design.md
    2026-04-26-agent-os-v3-design.md   ← this document
```

### Clarify (no deletion)

Add `data_store/README.md`:
> Project-scoped knowledge DB. For personal use, `~/.knowledge-brain/knowledge.db` is recommended (global across projects). Use this path only when a team shares one DB committed to the repo.

### Target Folder Structure After Cleanup

```
context-os/
  AGENT_OS_CONSTITUTION.md     ← L0
  AGENTS.md                    ← L1 (Pi + Codex, Tier 1)
  CLAUDE.md                    ← L1 (Claude Code, Tier 2)
  .github/
    copilot-instructions.md    ← L1 (Copilot, Tier 2)
  .agent-os/
    schemas/                   ← JSON schemas (binding, telemetry, permission)
    contracts/                 ← contract index + signature
    runtime/                   ← gitignored, session artifacts
  execution/
    SKILL_REGISTRY.md
    skills/
    agents/
    protocols/
    commands/
    manifests/
  memory/
    MEMORY.md
    user/
    project/
    feedback/
    reference/
  data_store/
    README.md                  ← new
    knowledge.jsonl            ← committed export snapshot
  bootstrap/
    bootstrap.sh
    bootstrap.ps1
  scripts/
    compute_constitution_hash.py
    generate_contract_index.py
    verify_agent_os_bundle.py
  docs/
    design/                    ← all specs here
  .mcp.json.template
  .mcp.json                    ← gitignored
  README.md                    ← rewritten (see Section 7)
```

---

## Section 7: Human-Friendly README

The existing README.md is replaced with a document structured for a new user who has never heard of Agent OS.

### Structure

```
# Agent OS

What it is: one paragraph.
  AI session governance + persistent memory.
  Works in Pi (primary), Claude Code, Copilot, Codex.
  Clone it, run bootstrap, start your harness — done.

## Prerequisites
  - python3
  - uvx  →  curl -LsSf https://astral.sh/uv/install.sh | sh

## Quick Start
  Three numbered commands (from Section 5).

## What You Get
  - Every AI session declares ACTIVE or NOT_ACTIVE before doing anything
  - Skills load on demand when triggered by what you type
  - Memory persists across sessions — the AI remembers what it learned

## Harness Setup
  ### Pi (primary)          → AGENTS.md is already wired. No extra config.
  ### Claude Code           → one `claude mcp add` command
  ### Copilot               → one `.github/copilot-instructions.md` copy
  ### Codex                 → AGENTS.md is already wired. No extra config.

## Memory
  Global (recommended):  ~/.knowledge-brain/knowledge.db
  Project-scoped:        data_store/knowledge.db
  Verify:  brain --db-path $BRAIN_DB_PATH list

## Verify the Bundle
  python3 scripts/verify_agent_os_bundle.py

## Troubleshooting
  5-row table: symptom → cause → fix
  Covers: uvx not found, BINDING NOT_ACTIVE, brain query returns nothing,
          MCP tools missing in Claude Code, slow first run.
```

---

## Open Items (not in scope for this design)

1. **Skill checksums** — `execution/SKILL_REGISTRY.md` has `pending` checksums. Filling these requires skill content to be finalized. Separate task.
2. **Skill content** — `execution/skills/` files exist but need content matching the B11 subordination declaration format.
3. **Pi extension bridge** — Pi supports TypeScript extensions that could bridge MCP for Tier 1 harnesses. Not in scope; evaluate after Tier 1 path is stable.
4. **knowledge-brain search quality** — current substring match is acceptable for MVP. Vector/semantic search is a future enhancement; explicitly out of scope per knowledge-brain CLAUDE.md.
