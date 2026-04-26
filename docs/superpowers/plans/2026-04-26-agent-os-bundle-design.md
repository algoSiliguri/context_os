# Agent OS Bundle Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a bundleable Agent OS package with constitution-first authority, harness adapters, schema-backed contracts, optional execution/memory layers, and observable ACTIVE/NOT_ACTIVE runtime signaling.

**Architecture:** Keep Layer 0 (`AGENT_OS_CONSTITUTION.md`) as the sole authority, make Layer 1 adapters thin invokers only, and add Layer 2/3 as optional modular runtime data/components. Validate deterministically through JSON schemas and checksum/signature contracts, with machine-verifiable binding and telemetry outputs.

**Tech Stack:** Markdown contracts, JSON Schema Draft 2020-12, shell scripts, Python 3 validation tooling, JSONL runtime telemetry.

**Spec:** `docs/superpowers/specs/2026-04-26-agent-os-bundle-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `AGENT_OS_CONSTITUTION.md` | modify | Finalize B0-B10 contract blocks and hash/index references |
| `CLAUDE.md` | create | Claude adapter with A1-A4 only |
| `AGENTS.md` | create | Codex adapter with A1-A4 only |
| `.github/copilot-instructions.md` | create | Copilot adapter with A1-A4 only |
| `.agent-os/schemas/constitution-binding.schema.json` | create | Binding header schema validation |
| `.agent-os/schemas/telemetry-event.schema.json` | create | Runtime event envelope schema |
| `.agent-os/schemas/permission-manifest.schema.json` | create | L2 permission manifest schema |
| `.agent-os/contracts/index.json` | create | Canonical artifact hash index + version map |
| `.agent-os/contracts/signature.json` | create | Optional signature envelope placeholder/metadata |
| `.agent-os/runtime/.gitkeep` | create | Runtime output directory anchor |
| `.agent-os/runtime/events.jsonl` | create | Append-only event sink |
| `.agent-os/runtime/session.json` | create | Snapshot verifier target |
| `execution/SKILL_REGISTRY.md` | create | JIT registry metadata table |
| `execution/skills/` | create | Skill artifacts with S1-S9 structure |
| `execution/agents/` | create | Agent artifacts with AG1-AG8 structure |
| `execution/protocols/` | create | Protocol artifacts with P1-P7 structure |
| `execution/commands/` | create | Command docs with C1-C7 structure |
| `execution/manifests/*.permission.json` | create | Per-component least-privilege manifests |
| `memory/MEMORY.md` | create | Memory index and non-authority statement |
| `memory/user/.gitkeep` | create | User memory namespace |
| `memory/project/.gitkeep` | create | Project memory namespace |
| `memory/feedback/.gitkeep` | create | Feedback memory namespace |
| `memory/reference/.gitkeep` | create | Reference memory namespace |
| `.mcp.json.template` | create | MCP template for local memory server wiring |
| `data_store/knowledge.jsonl` | create | Canonical committed MCP export |
| `bootstrap/bootstrap.sh` | create | POSIX bootstrap generator and preflight checks |
| `bootstrap/bootstrap.ps1` | create | PowerShell bootstrap generator and preflight checks |
| `scripts/compute_constitution_hash.py` | create | Canonical B0 content-hash computation |
| `scripts/generate_contract_index.py` | create | Deterministic contract index generation |
| `scripts/verify_agent_os_bundle.py` | create | End-to-end validator for C1-C12 prerequisites |
| `.git/hooks/pre-commit` | modify/create | Prevent stale constitution hash/index commits |
| `docs/superpowers/specs/2026-04-26-agent-os-bundle-design.md` | modify | Mark resolved implementation decisions |
| `README.md` | create | Installation modes + ACTIVE/NOT_ACTIVE expectations |

---

## Task 1: Scaffold Layered Bundle Layout

**Files:**
- Create: `.agent-os/schemas/`, `.agent-os/contracts/`, `.agent-os/runtime/`, `execution/`, `memory/`, `bootstrap/`, `scripts/`, `data_store/`
- Create: all `.gitkeep` placeholders above

- [ ] **Step 1: Create required directories**

Run:

```bash
mkdir -p .agent-os/{schemas,contracts,runtime} \
  execution/{skills,agents,protocols,commands,manifests} \
  memory/{user,project,feedback,reference} \
  bootstrap scripts data_store .github
```

Expected: all directories exist and `find . -maxdepth 3 -type d | rg "agent-os|execution|memory|bootstrap|scripts|data_store"` shows them.

- [ ] **Step 2: Add placeholder anchor files**

Run:

```bash
touch .agent-os/runtime/.gitkeep memory/user/.gitkeep memory/project/.gitkeep memory/feedback/.gitkeep memory/reference/.gitkeep
```

Expected: placeholders are tracked and keep empty directories in git.

- [ ] **Step 3: Commit scaffold**

```bash
git add .agent-os execution memory bootstrap scripts data_store .github
git commit -m "chore: scaffold agent-os layered bundle directories"
```

---

## Task 2: Implement Invocation Layer Adapters (A1-A4 Only)

**Files:**
- Create: `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`

- [ ] **Step 1: Write Claude adapter (`CLAUDE.md`)**

Use exactly these four blocks (A1-A4), with constitution path `./AGENT_OS_CONSTITUTION.md` and no extra workflow logic.

- [ ] **Step 2: Write Codex adapter (`AGENTS.md`)**

Mirror the same A1-A4 semantics as `CLAUDE.md`; only harness naming changes.

- [ ] **Step 3: Write Copilot adapter (`.github/copilot-instructions.md`)**

Mirror the same A1-A4 semantics; keep file strictly invocation-only.

- [ ] **Step 4: Verify no adapter contains authority language**

Run:

```bash
rg -n "must always|policy|authority|governing rules|workflow" CLAUDE.md AGENTS.md .github/copilot-instructions.md
```

Expected: either no matches or only explicit deference statements to constitution.

- [ ] **Step 5: Commit adapter layer**

```bash
git add CLAUDE.md AGENTS.md .github/copilot-instructions.md
git commit -m "feat: add non-authoritative harness adapters with A1-A4 contract"
```

---

## Task 3: Finalize Constitution Contract Blocks (B0-B10)

**Files:**
- Modify: `AGENT_OS_CONSTITUTION.md`

- [ ] **Step 1: Ensure B0 binding header is first machine-readable block after frontmatter**

Include required fields from spec: `system-id`, `version`, `canonical-path`, `content-hash`, `schema-version`, `contract-index-hash`, `clause-count`, `blocks[]`, `binding-mode`, `signature-required`.

- [ ] **Step 2: Verify B1-B10 sections exist and match spec semantics**

Confirm presence and numbering for: identity, authority declaration, binding conditions C1-C12, invalidation I1-I12, output contract B5, non-authority list, violation semantics, JIT registry, permission baseline, telemetry.

- [ ] **Step 3: Add deterministic references to schema/index paths**

Ensure constitution references exact files under `.agent-os/schemas/` and `.agent-os/contracts/`.

- [ ] **Step 4: Validate constitution structure quickly**

Run:

```bash
rg -n "\[B0\]|\[B1\]|\[B2\]|\[B3\]|\[B4\]|\[B5\]|\[B6\]|\[B7\]|\[B8\]|\[B9\]|\[B10\]" AGENT_OS_CONSTITUTION.md
```

Expected: all blocks found exactly once.

- [ ] **Step 5: Commit constitution updates**

```bash
git add AGENT_OS_CONSTITUTION.md
git commit -m "feat: finalize constitution B0-B10 machine-verifiable contract"
```

---

## Task 4: Add Normative Schemas and Contract Index Artifacts

**Files:**
- Create: `.agent-os/schemas/constitution-binding.schema.json`
- Create: `.agent-os/schemas/telemetry-event.schema.json`
- Create: `.agent-os/schemas/permission-manifest.schema.json`
- Create: `.agent-os/contracts/index.json`
- Create: `.agent-os/contracts/signature.json`

- [ ] **Step 1: Implement `constitution-binding.schema.json`**

Require all B0 header properties, enforce string formats and enum constraints for `binding-mode` and `signature-required` semantics.

- [ ] **Step 2: Implement `telemetry-event.schema.json`**

Model common envelope (`event_id`, `event_type`, `session_id`, `trace_id`, `span_id`, `system_id`, `constitution_version`, `harness_id`, `timestamp`, `payload`) and constrain `event_type` to required classes.

- [ ] **Step 3: Implement `permission-manifest.schema.json`**

Define capability documents with deny-by-default scopes (`fs.read`, `fs.write`, `tool.exec`, `memory.write`, `net.access`) and disallow wildcard `*` in scope fields.

- [ ] **Step 4: Create initial `index.json` and `signature.json`**

`index.json` should map artifact paths to SHA256 hashes and include version metadata; `signature.json` should include algorithm (`ed25519`), key-id, signature value (or null), and signed artifact reference.

- [ ] **Step 5: Validate schemas are parseable JSON**

Run:

```bash
python3 -m json.tool .agent-os/schemas/constitution-binding.schema.json >/dev/null
python3 -m json.tool .agent-os/schemas/telemetry-event.schema.json >/dev/null
python3 -m json.tool .agent-os/schemas/permission-manifest.schema.json >/dev/null
python3 -m json.tool .agent-os/contracts/index.json >/dev/null
python3 -m json.tool .agent-os/contracts/signature.json >/dev/null
```

Expected: no errors.

- [ ] **Step 6: Commit contract package artifacts**

```bash
git add .agent-os/schemas .agent-os/contracts
git commit -m "feat: add constitution binding, telemetry, and permission schemas with contract index"
```

---

## Task 5: Build Execution Layer Baseline (Registry + Components + Manifests)

**Files:**
- Create: `execution/SKILL_REGISTRY.md`
- Create: `execution/skills/brainstorming/SKILL.md`, `execution/skills/tdd/SKILL.md`, `execution/skills/debugging/SKILL.md`, `execution/skills/planning/SKILL.md`, `execution/skills/review/SKILL.md`, `execution/skills/spec-writing/SKILL.md`
- Create: `execution/agents/design.agent.md`, `execution/agents/implementation.agent.md`, `execution/agents/review.agent.md`
- Create: `execution/protocols/handoff.md`, `execution/protocols/verification-gate.md`, `execution/protocols/context-packet.md`
- Create: `execution/commands/README.md`
- Create: `execution/manifests/*.permission.json`

- [ ] **Step 1: Write `execution/SKILL_REGISTRY.md` table**

Add columns: `skill-id`, `trigger-pattern`, `path`, `version`, `cache-class`, `deps[]`, `checksum`.

- [ ] **Step 2: Create all skill files with S1-S9 sections**

Each skill must include subordination declaration, explicit scope, invocation condition, deterministic procedure, output format, termination, dependencies, capabilities, telemetry hooks.

- [ ] **Step 3: Create all agent files with AG1-AG8 sections**

Define role, permitted/forbidden actions, scope boundary, handoff format, capability budget, escalation policy.

- [ ] **Step 4: Create protocol files with P1-P7 sections**

Define phase sequence, gate conditions, handoff artifacts, failure behavior, telemetry, retry/timeout policy.

- [ ] **Step 5: Create component permission manifests**

For each skill/agent/protocol, add matching manifest under `execution/manifests/` validated by permission schema.

- [ ] **Step 6: Verify execution artifacts are subordinate and non-authoritative**

Run:

```bash
rg -n "authority:\s*none|conflict-resolution:\s*constitution governs|permissions-manifest:" execution
```

Expected: every component file contains these declarations.

- [ ] **Step 7: Commit execution layer baseline**

```bash
git add execution
git commit -m "feat: add execution layer registry, components, and permission manifests"
```

---

## Task 6: Add Memory Layer + MCP Template + Runtime Contracts

**Files:**
- Create: `memory/MEMORY.md`
- Create: `.mcp.json.template`
- Create: `data_store/knowledge.jsonl`
- Create: `.agent-os/runtime/events.jsonl`
- Create: `.agent-os/runtime/session.json`

- [ ] **Step 1: Write `memory/MEMORY.md`**

Document namespaces (`user`, `project`, `feedback`, `reference`), non-authority status, and conflict resolution rules aligned with Section 5 of the spec.

- [ ] **Step 2: Create `.mcp.json.template`**

Use project-scoped absolute DB path variables and local server command contract; include comments for generated `.mcp.json` behavior.

- [ ] **Step 3: Seed runtime verifier files**

Initialize `.agent-os/runtime/events.jsonl` as empty and `.agent-os/runtime/session.json` with a schema-valid NOT_ACTIVE snapshot template.

- [ ] **Step 4: Seed canonical data store export**

Create `data_store/knowledge.jsonl` with zero or sample-safe records; do not commit `knowledge.db`.

- [ ] **Step 5: Commit memory/runtime layer assets**

```bash
git add memory .mcp.json.template data_store/knowledge.jsonl .agent-os/runtime
git commit -m "feat: add optional memory layer and runtime verifier file contracts"
```

---

## Task 7: Implement Tooling for Hash, Index, and Bundle Verification

**Files:**
- Create: `scripts/compute_constitution_hash.py`
- Create: `scripts/generate_contract_index.py`
- Create: `scripts/verify_agent_os_bundle.py`
- Modify/Create: `.git/hooks/pre-commit`

- [ ] **Step 1: Implement `compute_constitution_hash.py`**

Read `AGENT_OS_CONSTITUTION.md`, blank only `content-hash` value in B0, compute SHA256, print and optionally update file in-place (`--write`).

- [ ] **Step 2: Implement `generate_contract_index.py`**

Hash required contract artifacts and write deterministic sorted `.agent-os/contracts/index.json`.

- [ ] **Step 3: Implement `verify_agent_os_bundle.py`**

Checks:
- required files exist (C1 family)
- B0 fields parse and validate against `constitution-binding.schema.json`
- constitution hash and contract index hash match
- schemas parse and required enums/fields exist
- adapters include A1-A4 blocks and do not add authority semantics

Exit code `0` on success, non-zero with clear failure messages.

- [ ] **Step 4: Wire local pre-commit guard**

Hook should run:

```bash
python3 scripts/compute_constitution_hash.py --check
python3 scripts/generate_contract_index.py --check
python3 scripts/verify_agent_os_bundle.py
```

Reject commit on any failure.

- [ ] **Step 5: Validate tooling behavior**

Run:

```bash
python3 scripts/compute_constitution_hash.py --check
python3 scripts/generate_contract_index.py --check
python3 scripts/verify_agent_os_bundle.py
```

Expected: all checks pass before continuing.

- [ ] **Step 6: Commit tooling**

```bash
git add scripts .git/hooks/pre-commit
git commit -m "feat: add deterministic hash/index generation and bundle verification tooling"
```

---

## Task 8: Add Bootstrap and Documentation for Installation Modes

**Files:**
- Create: `bootstrap/bootstrap.sh`
- Create: `bootstrap/bootstrap.ps1`
- Create/Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-26-agent-os-bundle-design.md`

- [ ] **Step 1: Implement bootstrap scripts**

Both scripts must:
- verify required tools (`python3`; `uvx` for MCP mode)
- generate `.mcp.json` from template when requested
- copy/create adapter files if missing
- print observable status for MCP availability (no silent fail)

- [ ] **Step 2: Write README usage and verification section**

Cover clone/submodule/template modes, minimum valid install (L0+L1), and explicit ACTIVE/NOT_ACTIVE expectations with sample BINDING event JSON.

- [ ] **Step 3: Update spec open questions with concrete resolutions**

Mark resolved items (adapter wording, bootstrap failure signaling, hash tooling, session snapshot decision).

- [ ] **Step 4: Smoke test bootstrap paths**

Run:

```bash
bash bootstrap/bootstrap.sh --dry-run
python3 scripts/verify_agent_os_bundle.py
```

Expected: dry-run succeeds; verifier still passes.

- [ ] **Step 5: Commit docs/bootstrap updates**

```bash
git add bootstrap README.md docs/superpowers/specs/2026-04-26-agent-os-bundle-design.md
git commit -m "docs: add bootstrap and usage guidance for agent-os bundle activation"
```

---

## Task 9: End-to-End Verification and Release-Ready Check

**Files:**
- Verify only

- [ ] **Step 1: Run full verification suite**

```bash
python3 scripts/compute_constitution_hash.py --check
python3 scripts/generate_contract_index.py --check
python3 scripts/verify_agent_os_bundle.py
```

Expected: all pass.

- [ ] **Step 2: Validate required layer files are present**

Run:

```bash
test -f AGENT_OS_CONSTITUTION.md && test -f CLAUDE.md && test -f AGENTS.md && test -f .github/copilot-instructions.md
```

Expected: command exits `0`.

- [ ] **Step 3: Validate telemetry schema against sample BINDING event**

Run a one-off validation command using `python3 -c` (or a helper in `verify_agent_os_bundle.py`) to confirm sample ACTIVE and NOT_ACTIVE events are schema-valid.

- [ ] **Step 4: Final commit (if any residual edits)**

```bash
git add -A
git commit -m "chore: finalize agent-os bundle implementation and verification"
```

---

## Acceptance Criteria

- Binding authority comes only from `AGENT_OS_CONSTITUTION.md` and validates through B0 + schemas + contract index.
- Each harness adapter is invocation-only and emits explicit NOT_ACTIVE behavior when binding fails.
- Layer 2 and Layer 3 are optional and removable without invalidating a successful L0/L1 bind.
- Telemetry/event contracts are machine-validated and externally verifiable via stdout and `.agent-os/runtime/events.jsonl`.
- Hash/index drift is blocked by verification tooling before commit.
- Bootstrap setup reports MCP availability explicitly and never silently degrades.
