---
title: Agent OS Bundle Design
date: 2026-04-26
status: draft
version: v2
constitution-version: v2
---

# Agent OS Bundle Design

## Purpose

Design a bundleable, harness-agnostic Agent OS system that allows a user to take deterministic control of an agentic coding loop across different harnesses (Claude Code, GitHub Copilot, OpenAI Codex, and others).

This document is a design spec. It defines structure, responsibilities, and constraints — not implementation code.

---

## Governing Constraint

All design decisions in this document are subordinate to `AGENT_OS_CONSTITUTION.md`. If any section of this document conflicts with the constitution, the constitution governs.

---

## Packaging Model

### Layer Hierarchy

```
Level 0 — The System
  AGENT_OS_CONSTITUTION.md
  Single canonical file. Harness-agnostic. Sole source of execution authority.

Level 1 — Invocation Layer
  One adapter file per harness.
  Each adapter attempts to invoke the constitution within its harness runtime.
  Non-authoritative. No content authority. Pointer only.
  If invocation fails: session is NOT ACTIVE. No fallback. No silent degradation.

Level 2 — Execution Layer (optional)
  Skills, agents, protocols, commands.
  Subordinate to the constitution. Modular and removable.
  Removal does not invalidate session.

Level 3 — Memory Layer (optional)
  File-based or MCP-based. Data only. Non-authoritative.
  Removal does not invalidate session.
```

### Installation Invariant

| Condition | Session state |
|---|---|
| L0 missing | Agent OS cannot be attempted |
| L0 present, L1 missing | Agent OS cannot be attempted in this harness |
| L0 + L1 present, constitution successfully bound as governing authority | **Agent OS ACTIVE** |
| L0 + L1 present, binding fails for any reason | **Agent OS NOT ACTIVE** — declared explicitly and observably. Not inferred from behavior. |
| L2 / L3 absent | Session valid if binding succeeded |
| L2 / L3 conflict with L0 | Constitution governs. Conflicting artifact loses authority. |

### Ergonomic Layers (Non-Authoritative)

- **Template repo** — bundle pre-wired for new project creation. Not a source of authority.
- **Bootstrap script** — generates per-machine config (e.g., `.mcp.json`), copies adapters. Not a source of authority.

Installing L0 + L1 enables a session to **attempt** running Agent OS. Runtime validity is confirmed at session start, per harness, per execution. Installation does not guarantee validity.

### Three Usage Modes

| Mode | How | Who |
|---|---|---|
| Clone to project root | `git clone agent-os my-project` | Beginner |
| Git submodule | `git submodule add agent-os .agent-os` | Intermediate — existing project |
| GitHub template repo | "Use this template" on GitHub | Beginner — new project |

### Beginner Entry Path

Minimum valid installation: two files.

```
my-project/
├── AGENT_OS_CONSTITUTION.md
└── CLAUDE.md                 ← adapter for Claude Code
```

No execution layer. No memory layer. No bootstrap. If the constitution binds: Agent OS is active.

---

## Section 2: Constitution Layer

### Role

The constitution is the sole authoritative artifact. It is not interpreted as prose at runtime; it is validated as a contract package with machine-verifiable schemas and deterministic binding checks.

- Binding = successful handshake
- Failure = rejected handshake
- Ambiguity = invalid session

### Contract Package (Normative)

The constitution layer is considered valid only when all normative artifacts are present and mutually consistent.

| Artifact | Path | Required | Validation |
|---|---|---|---|
| Constitution text | `AGENT_OS_CONSTITUTION.md` | Yes | Canonical hash + header schema |
| Binding schema | `.agent-os/schemas/constitution-binding.schema.json` | Yes | JSON Schema Draft 2020-12 |
| Event schema | `.agent-os/schemas/telemetry-event.schema.json` | Yes | JSON Schema Draft 2020-12 |
| Permission schema | `.agent-os/schemas/permission-manifest.schema.json` | Yes | JSON Schema Draft 2020-12 |
| Contract index | `.agent-os/contracts/index.json` | Yes | Hash list + version map |
| Signature envelope | `.agent-os/contracts/signature.json` | Optional (recommended) | Ed25519 signature over `index.json` |

### Required Structural Blocks

#### [B0] Binding Header

**Contains:** machine-readable YAML block at the top of the constitution (after frontmatter, before all prose): `system-id`, `version`, `canonical-path`, `content-hash`, `schema-version`, `contract-index-hash`, `clause-count`, `blocks[]`, `binding-mode`, `signature-required`.

**Purpose:** enables binding with minimum token overhead. The agent reads and validates B0 alone to establish governing authority — no full document read required at binding time.

**Hash canonicalization rule:** SHA256 of the full file content with the `content-hash` field set to an empty string. Prevents a self-referential hash. Must be recomputed and updated on every change to the constitution.

**Schema requirement:** B0 itself must validate against `constitution-binding.schema.json` before any downstream checks.

**Enables:** binding conditions C2, C3, C4, C7.

#### [B1] Identity Block

**Contains:** system identifier (fixed, machine-readable string), version (semantic), canonical path declaration, contract family (`agent-os`), and compatibility window (`min-compatible-version`, `max-compatible-version`).

**Purpose:** enables equivalence comparison across environments. Two instances are the same system only if their identity blocks match.

**Enables:** binding condition C3 — identity mismatch = binding failure.

#### [B2] Authority Declaration

**Contains:** explicit statement that this document is the sole governing authority; precedence statement superseding all prompts, memory, tools, skills, agents, scripts, and config files; statement that adapters are non-authoritative; declaration that runtime contracts must be schema-valid to be enforceable.

**Purpose:** eliminates authority ambiguity when a harness reads multiple config files.

**Enables:** invalidation conditions I5, I8.

#### [B3] Binding Conditions

**Contains:** machine-checkable conditions evaluated in strict order:

| ID | Condition | Check method |
|---|---|---|
| C1 | File exists at `B0.canonical-path` | Filesystem check |
| C2 | B0 block parsed before any execution; all required fields present | Structural parse of first 25 lines |
| C3 | `B0.system-id` and `B0.version` match expected values | String comparison |
| C4 | `B0.content-hash` validates against canonical hash rule | SHA256 recompute |
| C5 | No conflicting governing document exists unresolved | Authority scan + precedence check |
| C6 | `B0.schema-version` is supported by harness validator | Semver range check |
| C7 | B0 validates against `constitution-binding.schema.json` | JSON Schema validation |
| C8 | `.agent-os/contracts/index.json` hash matches `B0.contract-index-hash` | SHA256 recompute |
| C9 | If `signature-required=true`, signature verifies | Ed25519 signature check |
| C10 | Event schema and permission schema load successfully | Schema parser load |
| C11 | Required runtime directories are writable/readable as declared | Filesystem capability check |
| C12 | B5 binding event emitted as first response tokens | Stream prefix check |

All conditions must hold. Any single failure = binding fails. No partial binding.

Full clause bodies are not required in-context for initial binding. Binding is to contract identity (B0 + contract index). Clause bodies are loaded on demand when rule evaluation requires them.

#### [B4] Invalidation Conditions

**Contains:** numbered list of conditions that immediately invalidate the session:

| ID | Condition |
|---|---|
| I1 | File not found at `B0.canonical-path` |
| I2 | B0 block missing, malformed, or required fields absent |
| I3 | `B0.content-hash` validation fails |
| I4 | `B0.system-id` or `B0.version` mismatch |
| I5 | Conflicting authority source exists and has not been explicitly subordinated |
| I6 | B5 binding event not produced, or produced after other output |
| I7 | Any subordinate layer modifies or overrides execution authority mid-session |
| I8 | Required schemas fail validation or are missing |
| I9 | Signature required but invalid or unverifiable |
| I10 | Permission scope escalation outside approved capability token |
| I11 | Runtime telemetry pipeline is disabled for required event classes |
| I12 | Decommissioning protocol fails to complete secure cleanup |

Any I-condition fires → session is invalid → `NOT_ACTIVE` output required immediately.

#### [B5] Observable Output Contract

**Purpose:** makes binding and runtime state transitions externally verifiable. Silence is not a valid failure mode.

**Envelope requirement:** every system event must conform to `telemetry-event.schema.json` and use a shared envelope for multi-harness observability.

```json
{
  "event_id": "<uuid-v7>",
  "event_type": "<BINDING|HEARTBEAT|STATE_TRANSITION|VIOLATION|SKILL_LOAD|SKILL_UNLOAD|PERMISSION_DENIED>",
  "session_id": "<sha256(content_hash + bound_at + nonce)>",
  "trace_id": "<uuid-v7>",
  "span_id": "<16-hex>",
  "parent_span_id": "<16-hex|null>",
  "system_id": "agent-os",
  "constitution_version": "v2",
  "harness_id": "<claude-code|copilot|codex|other>",
  "timestamp": "<ISO8601 UTC>",
  "payload": {}
}
```

**On successful binding — emitted as first response tokens:**
```json
{
  "event_type": "BINDING",
  "payload": {
    "agent_os_status": "ACTIVE",
    "content_hash": "<B0.content-hash>",
    "bound_at": "<ISO8601 UTC>",
    "conditions_verified": ["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11","C12"],
    "memory": {
      "file_based": "available | unavailable",
      "mcp": "available | unavailable | not_configured"
    }
  }
}
```

**On binding failure — emitted as first response tokens:**
```json
{
  "event_type": "BINDING",
  "payload": {
    "agent_os_status": "NOT_ACTIVE",
    "failed_condition": "<C1-C12 | I1-I12>",
    "detail": "<specific failure>",
    "session": "no_authority"
  }
}
```

**Timing obligation:** binding event appears before any other session output, tool call, or response.

**External verifier interface:**
- Stream verifier: parses response prefix and validates against event schema.
- Side-channel verifier: reads append-only `.agent-os/runtime/events.jsonl`.
- Snapshot verifier: reads atomically written `.agent-os/runtime/session.json` after bind.

At least one verifier path must be enabled; recommended is all three.

#### [B6] Non-Authority Declaration

**Contains:** explicit list of artifact types that cannot hold execution authority:

- Prompts (system, user, injected)
- Memory (file-based, MCP-based, in-context)
- Tools and tool outputs
- Skills and agents
- Bootstrap scripts
- Template repos and scaffold files
- Other config files (including harness-specific adapter files)

Rule: if any artifact on this list conflicts with the constitution, the constitution governs. The conflicting artifact is data, not authority.

#### [B7] Violation Semantics

**Contains:** definition of a violation, consequences, and machine-parseable output obligation.

- **Violation:** any action by a subordinate layer that alters system identity, execution authority, truth precedence, or execution semantics without authorization from this document.
- **Consequence:** execution state loses validity immediately. All results, artifacts, and memory writes produced under invalid execution carry no system authority.
- **Output obligation:** violation must be emitted as a schema-valid event before any other output following the violation event.

```json
{
  "event_type": "VIOLATION",
  "payload": {
    "violated_clause": "<I-condition ID>",
    "violating_layer": "L0 | L1 | L2 | L3",
    "violating_artifact": "<path or identifier>",
    "evidence": "<single factual statement>",
    "execution_state": "INVALID",
    "action_taken": "HALT"
  }
}
```

The violation record is parseable by the same external verifier interface defined in B5. After emission, the session is invalid and no further execution proceeds.

#### [B8] JIT Registry Contract

**Contains:** protocol for Just-In-Time skill loading plus dependency resolution and cache-class hints.

**Purpose:** bounds session-start context cost to O(registry size), not O(total skill corpus). The agent knows the laws (L0) and the skill map — never individual skill bodies — until the moment of invocation.

**At session binding:** only registry metadata loads (`execution/SKILL_REGISTRY.md` or equivalent JSON export). Registry entry format:

| skill-id | trigger-pattern | path | version | cache-class | deps[] | checksum |
|---|---|---|---|---|---|---|
| `<id>` | `<keyword or regex>` | `execution/skills/<id>/SKILL.md` | `<semver>` | `hot|cold` | `["skill-x@^2"]` | `<sha256>` |

**JIT load lifecycle:** trigger match → resolve dependency graph → validate checksums → permission preflight → load required skills → execute → unload cold skills.

**Failure records (emitted before other output; session remains valid):**
- File missing: `{"agent_os_event": "SKILL_NOT_FOUND", "skill_id": "<id>", "path": "<path>"}`
- No registry match: `{"agent_os_event": "UNKNOWN_SKILL", "trigger": "<matched input>"}`
- Dependency cycle: `{"agent_os_event": "DEPENDENCY_CYCLE", "cycle": ["a","b","a"]}`
- Version conflict: `{"agent_os_event": "DEPENDENCY_CONFLICT", "requirement": "skill-a@^2", "resolved": "skill-a@1.9.0"}`

**Registry governance:** `SKILL_REGISTRY.md` is an L2 artifact — a routing table, not an authority source. Adding or removing entries does not affect constitution binding.

#### [B9] Permission Baseline Contract

**Contains:** immutable rules for least-privilege enforcement between L0 and L2.

- Every executable L2 component must provide a permission manifest valid under `permission-manifest.schema.json`.
- Runtime grants are capability tokens minted by L0, scoped by operation, path/tool, and TTL.
- No component may request wildcard authority (`*`) for file, network, process, or memory operations.
- Capability tokens are non-transferrable across components and sessions.

Permission model (minimum):

| Capability | Scope Fields | Example |
|---|---|---|
| `fs.read` | `paths[]` | `["/repo/docs/**"]` |
| `fs.write` | `paths[]` | `["/repo/tmp/session-<id>/**"]` |
| `tool.exec` | `commands[]` | `["rg","git status"]` |
| `memory.write` | `namespaces[]` | `["project","feedback"]` |
| `net.access` | `domains[]` | `["api.openai.com"]` |

Any capability usage outside the minted token scope triggers I10.

#### [B10] Telemetry Contract

**Contains:** distributed observability requirements across harnesses and agent loops.

- Required event classes: `BINDING`, `STATE_TRANSITION`, `HEARTBEAT`, `SKILL_LOAD`, `SKILL_UNLOAD`, `PERMISSION_DENIED`, `VIOLATION`.
- Heartbeat cadence: default 10s, max 30s between heartbeats while session is active.
- Missing 3 consecutive heartbeats marks session `SUSPECT`; missing 6 marks `DEGRADED`.
- Each event must carry `trace_id` and `span_id` to support cross-harness correlation.
- Transport targets: stdout stream (required), JSONL file sink (required), optional OTLP bridge.

Heartbeat payload contract:
```json
{
  "event_type": "HEARTBEAT",
  "payload": {
    "state": "<PROVISIONING|ACTIVE|DEGRADED|DECOMMISSIONING>",
    "queue_depth": "<int>",
    "loaded_skills": ["<skill-id>"],
    "hot_cache_size": "<int>",
    "cold_cache_size": "<int>",
    "last_error": "<null|string>"
  }
}
```

---

## Section 3: Invocation Layer

### Adapter Responsibility

Each adapter does exactly three things:

1. Instruct the harness to read the constitution before any execution
2. Instruct the harness to produce NOT ACTIVE output if constitution cannot be bound
3. Defer all authority, rules, and execution semantics to the constitution

Any adapter content beyond these three is a violation — it introduces material that competes with constitution authority.

### Adapter Structure (Four Required Blocks)

```
[A1] Self-Declaration
  This file is non-authoritative.
  It does not define execution rules, policies, or system identity.
  It only attempts to invoke the governing contract.

[A2] Invocation Instruction
  Before any execution begins, read: <path to AGENT_OS_CONSTITUTION.md>
  The file at that path is the governing contract for this session.

[A3] Failure Instruction
  If the file at that path cannot be read, does not exist, or cannot be
  bound as the governing authority:
    → Do not proceed as Agent OS active
    → Produce the required NOT ACTIVE output immediately
    → Operate under no Agent OS authority

[A4] Deference
  If the file is successfully bound, follow its binding conditions,
  invalidation conditions, and output contract exactly.
  This file has no further instructions.
```

### Per-Harness Adapter Locations

| Harness | Adapter file |
|---|---|
| Claude Code | `CLAUDE.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` |

Constitution path in A2: `./AGENT_OS_CONSTITUTION.md` (relative from project root). Adapter location varies. Invocation logic is identical across all adapters.

### Harness Capability Taxonomy

| Capability | Definition | Binding outcome |
|---|---|---|
| File-capable | Harness can read arbitrary files before responding | Binding attempt is possible |
| Context-only | Harness operates only on files explicitly provided in context | Binding requires user to provide constitution file contents explicitly. Otherwise: NOT ACTIVE. |
| Injection-only | Harness reads only its designated config file | A2 cannot be satisfied. Session is NOT ACTIVE. |

No capability tier silently degrades into an active session.

### Binding Attempt Sequence

```
1. Harness loads adapter → receives A1 (non-authoritative self-declaration)
2. Adapter A2 → harness locates AGENT_OS_CONSTITUTION.md
     File not found → go to 6 (failure: I1)
3. Harness reads B0 block (≤25 lines after frontmatter) — no full document read
     B0 missing or malformed → go to 6 (failure: I2)
4. Harness validates B0 and contract package: identity (C3), content-hash (C4), schema checks (C7/C10), signature/index checks (C8/C9), authority scan (C5)
     Any condition fails → go to 6 (failure: I3 / I4 / I5 / I8 / I9)
5. Harness emits B5 JSON success record as first response tokens (C12)
     → Session valid. Full clause bodies authoritative on-demand. Load SKILL_REGISTRY.md.
6. Harness emits B5 JSON failure record as first response tokens
     → Session invalid. No Agent OS execution.
```

Every path terminates in either an explicit `ACTIVE` or an explicit `NOT_ACTIVE`. No middle state. The B0 fast-path means binding overhead is bounded to a fixed small read — not proportional to constitution length.

---

## Section 4: Execution Layer

### Role

Defines how work is executed after binding succeeds. L2 is a constrained runtime: contracts are schema-validated, permissions are tokenized, telemetry is mandatory, and lifecycle transitions are explicit.

### Runtime State Machine

```text
PROVISIONING -> ACTIVE -> DECOMMISSIONING -> TERMINATED
                    |-> DEGRADED -----------^
```

- `PROVISIONING`: preflight checks, registry load, cache warm-up, capability minting.
- `ACTIVE`: command/skill execution with heartbeat and tracing.
- `DEGRADED`: execution still possible but under reduced guarantees (for example heartbeat sink failure).
- `DECOMMISSIONING`: no new work accepted; cleanup + flush.
- `TERMINATED`: session artifacts sealed and closed.

### Component Taxonomy

| Type | Role | Defines | Cannot Define |
|---|---|---|---|
| Skill | Reusable capability | Procedure steps, output formats, decision rules within scope | Session authority, truth precedence, execution validity |
| Agent | Role-scoped executor | Permitted actions, role boundary, scope of operation | Authority beyond declared scope |
| Protocol | Phase sequencing | Sequencing rules, phase gates, handoff formats | Completion criteria that override constitution validity |
| Command | User-triggered action | What action to perform when invoked | Session authority, harness behavior, execution semantics |

### Subordination Declaration (Required in Every Component)

```yaml
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: <explicit bounded declaration>
permissions-manifest: <relative path to manifest>
component-version: <semver>
integrity-sha256: <checksum of component file>
```

A component without this block is not part of Agent OS. It may be used standalone, but carries no Agent OS authority.

### Per-Component Required Structure

**Skills:**
```
[S1] Subordination Declaration
[S2] Scope: what this skill operates on
[S3] Invocation condition: when this skill is appropriate
[S4] Procedure: ordered steps
[S5] Output format: what this skill must produce
[S6] Termination: explicit completion condition
[S7] Dependencies: required skills + version constraints
[S8] Required capabilities: exact permission claims
[S9] Telemetry hooks: events emitted at start/success/failure
```

**Agents:**
```
[AG1] Subordination Declaration
[AG2] Role: one sentence, no authority language
[AG3] Permitted actions: explicit list
[AG4] Forbidden actions: explicit list
[AG5] Scope boundary: cannot expand beyond declared scope
[AG6] Handoff format: what this agent produces at completion
[AG7] Capability budget: max permissions this agent may mint per task
[AG8] Escalation policy: how denied actions are surfaced
```

**Protocols:**
```
[P1] Subordination Declaration
[P2] Phase sequence: ordered phases with entry and exit conditions
[P3] Gate definitions: conditions required before phase transition
[P4] Handoff artifact format: what each phase must produce
[P5] Failure behavior: what happens when a gate condition is not met
[P6] Telemetry contract: required event emission per phase
[P7] Timeout/retry policy: deterministic backoff and max attempts
```

**Commands:**
```
[C1] Subordination Declaration
[C2] Invocation syntax
[C3] Action: what the command does
[C4] Scope: permitted reads and writes
[C5] Output: what the command must produce
[C6] Capability map: command -> capability token set
[C7] Idempotency class: safe|unsafe|non-repeatable
```

### Provisioning Protocol

Provisioning is required before entering `ACTIVE`.

1. Validate constitution binding and required schemas.
2. Initialize telemetry sinks (stdout + JSONL).
3. Load registry metadata and build dependency graph index.
4. Classify cacheable skills (`hot` or `cold`) from registry hints + historical usage.
5. Mint base capability tokens for session services (not for user tasks).
6. Emit `STATE_TRANSITION(PROVISIONING->ACTIVE)` event.

If provisioning step fails, emit `VIOLATION` or `STATE_TRANSITION(PROVISIONING->DEGRADED)` depending on severity.

### JIT Loading, Dependencies, and Layered Cache

Skills are the primary scaling surface for L2. JIT loader is responsible for deterministic resolution and latency control.

**Resolution algorithm:**
1. Match trigger -> candidate `skill-id`.
2. Resolve dependency DAG with semver constraints.
3. Reject graph if cycle or unsatisfied version.
4. Verify each node checksum against registry.
5. Compute required capability union for the graph.
6. Ask L0 capability broker to mint minimal token set.
7. Load skills from cache or source in topological order.

**Layered cache model:**

| Cache tier | Contents | Eviction | Use case |
|---|---|---|---|
| L2-Hot | High-frequency skill AST/context fragments | LFU + TTL | interactive loops |
| L2-Warm | Recently used cold skills | LRU | burst workloads |
| L2-Cold | Checksummed skill blobs only (not injected context) | size cap + age | startup acceleration |

- Hot classification rule: promoted when usage count exceeds configurable threshold in rolling window.
- Cold classification rule: default for new or infrequently used skills.
- Prefetch policy: during idle windows, prefetch direct dependencies of currently hot skills.

**On invocation:** loader only injects resolved skills required by the current graph; unrelated skills remain unloaded.

**Failure handling:** missing skill, dependency cycle, checksum mismatch, or unsatisfied version emits schema-valid event and fails invocation only. Session remains valid unless a constitution invalidation condition is triggered.

### Zero-Trust Permission Scoping and Isolation

Execution layer runs under deny-by-default isolation.

- Every invocation receives short-lived capability tokens minted by L0 broker.
- Tokens include `capability`, `resource_scope`, `issued_at`, `expires_at`, `invocation_id`, `nonce`.
- Skills cannot mutate capability sets; they can only consume granted tokens.
- Token reuse across invocations is invalid.
- Any request outside token scope returns `PERMISSION_DENIED` event and does not execute.
- L2 artifacts are read-only with respect to L0 files (`AGENT_OS_CONSTITUTION.md`, contract schemas, signature envelope).

### Modularity Rules

- Skills load JIT (per B8), not at session start
- All other component types (agents, protocols, commands) load on demand
- Loading any component does not alter session state
- Adding or removing a component does not affect constitution binding
- A protocol referencing a removed component fails at its gate condition — explicit, not silent

### Distributed Telemetry and Tracing

- Every execution path emits start/end spans with shared `trace_id`.
- Heartbeats are mandatory while `ACTIVE` and include queue depth and loaded-skill snapshot.
- Cross-harness debugging is supported by normalizing event fields and preserving causal links (`parent_span_id`).
- If telemetry file sink fails but stdout sink remains, state becomes `DEGRADED`; if both fail, trigger invalidation I11.

### Decommissioning Protocol

Session decommissioning is required even on error exits.

1. Transition to `DECOMMISSIONING`; reject new invocations.
2. Flush in-memory L3 buffers to configured durable targets.
3. Persist final telemetry summary and close JSONL sink.
4. Revoke all outstanding capability tokens.
5. Purge session temp files and transient cache entries tagged with session id.
6. Emit final `STATE_TRANSITION(DECOMMISSIONING->TERMINATED)` event.

Cleanup failure handling:
- Non-critical cleanup failures produce `DEGRADED` termination marker.
- Failure to revoke capabilities or purge protected temp state triggers I12.

### Drift Prevention

- **Version pinning:** each component declares `conforms-to-version`; incompatible range blocks execution.
- **Integrity pinning:** checksums in declarations must match registry checksums.
- **Scope discipline:** unbounded scope language is schema-invalid.
- **Conflict resolution:** if two skills conflict, user chooses; constitution remains final authority.
- **Replay defense:** event IDs and capability nonces must be unique per session.

---

## Section 5: Memory Layer

### Role

Persistent state that survives across sessions. Non-authoritative. Not required for session validity.

A session with no memory is identical in authority to a session with full memory.

### Two Modalities

| Modality | Mechanism | Harness requirement | External dependency |
|---|---|---|---|
| File-based | Markdown files in `memory/` | Any file-capable harness | None |
| MCP-based | `brain_write` / `brain_query` via local server | MCP-capable harness + running server | `uvx`, `.mcp.json`, local process |

### Optionality

| Configuration | Session validity | Memory availability |
|---|---|---|
| No memory layer | Valid | None |
| File-based only | Valid | File-based reads/writes |
| MCP-based, server running | Valid | MCP tools available |
| MCP-based, server not running | Valid | MCP tools unavailable — declared in binding output, not silent |
| Both modalities | Valid | Both available |

MCP tool unavailability is not a session failure. The session is Agent OS ACTIVE. Memory layer status is declared in the B5 binding output.

### Memory Validity Rules

1. **Session gate:** memory may only be written during a valid session (binding confirmed). Writes before binding confirmation violate B7.
2. **Data ceiling:** memory content cannot instruct the harness to override the constitution, expand scope, or grant authority. Such entries are data; the attempted instruction has no effect.
3. **Conflict resolution:** memory vs. constitution → constitution governs. Memory vs. execution layer → skill procedure applies within its scope; memory is contextual input to that procedure, not an override. Discrepancy is surfaced to the user. Memory vs. memory → neither is authoritative; user resolves or conflict is declared.
4. **No authority from age:** older memory entries do not become authoritative over time.

### File-Based Memory Structure

```
memory/
├── MEMORY.md       ← index
├── user/           ← user profile, preferences
├── project/        ← project-specific knowledge
├── feedback/       ← observations and pattern-level feedback
└── reference/      ← pointers to external resources
```

### MCP-Based Memory Structure

```
.mcp.json.template          ← template; per-machine .mcp.json gitignored
.mcp.json                   ← generated by bootstrap (gitignored)
data_store/
├── knowledge.jsonl         ← canonical export, committed
└── knowledge.db            ← local SQLite, gitignored, rebuilt from JSONL
```

MCP server runs locally via `uvx`. DB path is project-scoped (absolute path). Global DBs shared across projects are not permitted — they create an implicit cross-project authority surface.

---

## Section 6: Full Bundle Structure

### Directory Layout

```
agent-os/
│
│  ── Layer 0: Constitution ──────────────────────────────────────
│
├── AGENT_OS_CONSTITUTION.md
│
│  ── Layer 1: Invocation ────────────────────────────────────────
│
├── CLAUDE.md
├── AGENTS.md
├── .github/
│   └── copilot-instructions.md
│
│  ── Layer 2: Execution ─────────────────────────────────────────
│
├── execution/
│   ├── SKILL_REGISTRY.md          ← loaded at binding; routing table only
│   ├── skills/
│   │   ├── brainstorming/SKILL.md
│   │   ├── tdd/SKILL.md
│   │   ├── debugging/SKILL.md
│   │   ├── planning/SKILL.md
│   │   ├── review/SKILL.md
│   │   └── spec-writing/SKILL.md
│   ├── agents/
│   │   ├── design.agent.md
│   │   ├── implementation.agent.md
│   │   └── review.agent.md
│   ├── protocols/
│   │   ├── handoff.md
│   │   ├── verification-gate.md
│   │   └── context-packet.md
│   └── commands/
│
│  ── Layer 3: Memory ────────────────────────────────────────────
│
├── memory/
│   ├── MEMORY.md
│   ├── user/
│   ├── project/
│   ├── feedback/
│   └── reference/
│
├── .mcp.json.template
├── .mcp.json                 ← gitignored
├── data_store/
│   ├── knowledge.jsonl
│   └── knowledge.db          ← gitignored
│
│  ── Ergonomic (non-authoritative) ──────────────────────────────
│
├── bootstrap/
│   ├── bootstrap.sh
│   └── bootstrap.ps1
│
└── docs/
    └── specs/
```

### Mapping Existing Artifacts

| Existing artifact | Destination | Change required |
|---|---|---|
| `AGENT_OS_CONSTITUTION.md` | Root — unchanged | Add B3–B7 structural blocks |
| Obsidian Vault `skills/` | `execution/skills/` | Add S1 subordination declaration to each |
| Obsidian Vault `agents/` | `execution/agents/` | Add AG1 subordination declaration + explicit scope bounds |
| Obsidian Vault `protocols/` | `execution/protocols/` | Add P1 subordination declaration |
| Obsidian Vault `copilot-instructions.md` | **Split:** workflow rules → `execution/skills/` and `execution/protocols/`; adapter file → `.github/copilot-instructions.md` (A1–A4 only) | Significant restructure — adapter replaces full file |
| `brain_playground` MCP setup | `data_store/` + `.mcp.json.template` | No structural change |
| `brain_playground/CLAUDE.md` | Brain guidance → relevant execution skills | Adapter file replaced with A1–A4 only |
| `~/.claude/projects/.../memory/` | `memory/` | Move to project scope or keep global and reference by path |

### Authority Chain at Runtime

```
Harness starts
  → Reads adapter [L1] — non-authoritative, attempts invocation
  → Reads B0 block from AGENT_OS_CONSTITUTION.md [L0] — validates binding/package checks C1–C12 (≤25 lines + contract artifacts)
  → Emits B5 JSON record — {"agent_os_status": "ACTIVE"|"NOT_ACTIVE"} — first tokens

If ACTIVE:
  → Loads SKILL_REGISTRY.md [L2] — routing table only; skill bodies not loaded
  → Full clause bodies [L0] — authoritative on-demand; load at point of conflict
  → Memory layer [L3] available if configured — data only
  → Session proceeds under constitution authority
  → Skill invoked → JIT-load SKILL.md → execute → release from context
  → Any violation → B7 fires → JSON violation record emitted → session invalid
```

### System Identity Across Environments

- Two machines run the same system if and only if `AGENT_OS_CONSTITUTION.md` is identical (B1 identity block matches, same version).
- Each execution layer artifact declares `conforms-to-version`. Version mismatch after a constitution update = artifact is suspect.
- Git history is the audit trail for constitution changes and component re-validation.

---

## Open Questions (implementation status)

1. ~~**Constitution content**~~ **Resolved (2026-04-26):** B0-B10 are implemented in `AGENT_OS_CONSTITUTION.md` with contract package references.
2. ~~**Adapter content**~~ **Resolved (2026-04-26):** `CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md` now contain A1-A4 invocation-only blocks.
3. ~~**Subordination declaration migration**~~ **Resolved (2026-04-26):** baseline execution components in `execution/skills/`, `execution/agents/`, and `execution/protocols/` include subordination declarations and manifest links.
4. ~~**Copilot adapter migration**~~ **Resolved (2026-04-26):** Copilot instructions were split into adapter-only content with workflow logic moved to execution-layer artifacts.
5. ~~**Memory scoping decision**~~ **Resolved:** memory remains optional and non-authoritative; project-scoped structure is provided under `memory/`.
6. ~~**MCP bootstrap observability**~~ **Resolved (2026-04-26):** `bootstrap/bootstrap.sh` and `bootstrap/bootstrap.ps1` emit explicit MCP availability states when `uvx` is missing.
7. ~~**Hash tooling**~~ **Resolved (2026-04-26):** `scripts/compute_constitution_hash.py`, `scripts/generate_contract_index.py`, and `.git/hooks/pre-commit` enforce drift checks.
8. ~~**Verifier side-channel decision**~~ **Resolved (2026-04-26):** `.agent-os/runtime/session.json` is included as enabled snapshot verifier output.
