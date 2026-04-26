# Context OS — Design Spec
**Date:** 2026-04-22

---

## Overview

Context OS is a deterministic, synchronous control layer that constructs prompts and dispatches them to coding agent CLIs. It is not an agent — it orchestrates context retrieval and prompt composition, then delegates execution to a configured CLI agent.

**Project location:** `~/Documents/context-os/`

---

## Architecture

### Pipeline

```
cli.py
  └── Runtime.run(task)
        ├── Planner.create_plan(task)         → Plan
        ├── Retriever.fetch(plan)             → list[ContextItem]
        ├── Filter.apply(items, plan)         → list[ContextItem]
        ├── Composer.build(task, items, plan) → str  (prompt)
        └── BaseAgent.run(prompt)             → str  (output)
```

Every stage communicates exclusively via typed return values. No shared state, no global variables, no side channels. Runtime is a thin five-line orchestrator — all behavior lives in injected modules.

### Approach: Class-based constructor injection (Approach B)

- Each pipeline stage is a class with one public method.
- Runtime receives instances, not imports. Concrete classes are named only in `cli.py`.
- **Approach A (flat functions) rejected:** Runtime must import concrete classes — swapping any module requires editing Runtime.
- **Approach C (shared mutable dict) rejected:** No typed contract between stages; any module can read/write any key.

---

## Folder Structure

```
~/Documents/context-os/        ← project root
  core/
    __init__.py
    plan.py
    context_item.py
    planner.py
    retriever.py
    filter.py
    composer.py
    runtime.py
  adapters/
    __init__.py
    base.py
    runner.py
    pi_agent.py
    generic_agent.py
  cli.py
  docs/
```

---

## Data Contracts

### `Plan`

```python
@dataclass
class Plan:
    task: str                    # Composer: prompt header
    context_query: str           # Retriever: what to fetch against
    constraints: list[str]       # Composer: Requirements section ([] = omit)
    output_format: str | None    # Composer: Output format line (None = omit)
    max_context_items: int = 5   # Filter: trim limit
```

**Deferred fields:** `task_type`, `context_requirements` — no named consumer in current scope.

### `ContextItem`

```python
@dataclass
class ContextItem:
    id: str                                       # Filter: deduplication key
    content: str                                  # Composer: injected verbatim
    source: str                                   # Composer: label prefix [source]
    metadata: dict = field(default_factory=dict)  # Reserved — no current consumer
```

**Deferred fields:** `type` — no named consumer in current scope.

### Field Ownership

| Field | Retriever | Filter | Composer |
|---|---|---|---|
| `plan.context_query` | ✓ | — | — |
| `plan.max_context_items` | — | ✓ | — |
| `plan.task` | — | — | ✓ |
| `plan.constraints` | — | — | ✓ |
| `plan.output_format` | — | — | ✓ |
| `item.id` | — | ✓ | — |
| `item.content` | — | — | ✓ |
| `item.source` | — | — | ✓ |

No module reads outside its column.

---

## Core Module Interfaces

```python
class Planner:
    def create_plan(self, task: str) -> Plan: ...

class Retriever:
    def fetch(self, plan: Plan) -> list[ContextItem]: ...

class Filter:
    def apply(self, items: list[ContextItem], plan: Plan) -> list[ContextItem]: ...

class Composer:
    def build(self, task: str, items: list[ContextItem], plan: Plan) -> str: ...

class BaseAgent:
    def run(self, prompt: str) -> str: ...
```

---

## Module Implementations (scaffold)

### Planner
Mirrors `task` as `context_query`. No constraints, no output format.

### Retriever
Returns three hardcoded mock `ContextItem`s. Extensibility point for file search, git log, or vector store.

### Filter
Deduplicates by `item.id` (first occurrence wins), then trims to `plan.max_context_items`. Preserves order. Reads no content fields.

### Composer
Builds prompt in sections:
1. `Task: {task}`
2. `Context:` — one `[source] content` line per item (omitted if empty)
3. `Requirements:` — one `- constraint` line per entry (omitted if `[]`)
4. `Output format: {output_format}` (omitted if `None`)

### Runtime
```python
def run(self, task: str) -> str:
    plan     = self.planner.create_plan(task)
    items    = self.retriever.fetch(plan)
    filtered = self.filter_.apply(items, plan)
    prompt   = self.composer.build(task, filtered, plan)
    return self.agent.run(prompt)
```

---

## Adapter Layer

### `AgentConfig`

```python
@dataclass
class AgentConfig:
    command: list[str]
    mode: Literal["arg", "stdin", "file"]
    arg_flag: str | None = None
```

### Invocation modes

| Mode | Subprocess call | Use case |
|---|---|---|
| `stdin` | `run(cmd, input=prompt)` | Agents that read piped input |
| `arg` | `run(cmd + [flag, prompt])` | Agents that accept a `--prompt` flag |
| `file` | Write to tempfile, `run(cmd + [path])` | Agents with arg size limits |

`shell=False` (default) — eliminates shell escaping issues entirely.

### Concrete adapters

- **`PiAgent`** — `mode="stdin"`, command `["pi"]`
- **`GenericAgent`** — configurable command, mode, and arg_flag via constructor (e.g. `GenericAgent(command=["claude"], mode="stdin")`)

Adding a new agent = one new file, zero changes to core.

---

## CLI

```bash
python cli.py run "your task" --agent pi
python cli.py run "your task" --agent generic
```

`argparse`-based. `AGENTS` registry maps name → factory lambda. Runtime is constructed fresh per invocation.

---

## Failure Modes

| Failure | Surface point | Handling |
|---|---|---|
| Empty context | `retriever.fetch()` returns `[]` | Composer omits context section — not an error |
| Invalid plan | `Plan` construction | `ValueError` propagates to CLI |
| Agent failure | `agent.run()` non-zero exit | `RuntimeError` propagates to CLI, prints stderr |

No retry, no fallback agents, no partial recovery — those are caller concerns.

---

## Decoupling Invariants

- Planner has no imports from Retriever, Filter, or Composer.
- Retriever has no imports from Composer.
- Filter reads one scalar field from Plan (`max_context_items`) — intentional, not a violation.
- Composer treats `items` as an opaque list of `(content, source)` pairs — blind to retrieval intent.
- Runtime imports no concrete adapter — only `BaseAgent` interface.

---

## Extensibility Notes

- **New agent:** add `adapters/<name>_agent.py`, register in `cli.py` `AGENTS` dict.
- **Real retrieval:** replace `Retriever.fetch()` body — interface unchanged.
- **Smarter planning:** replace `Planner.create_plan()` body — interface unchanged.
- **Scoring/ranking:** add `Scorer` module between Retriever and Filter; Filter reads `item.metadata["score"]`.

---

## Out of Scope

- Database or persistent storage
- Memory / session state
- Configuration file system
- Logging framework
- Async execution
- Plugin framework
