# Brain — Design Spec
**Date:** 2026-04-22

---

## Overview

Brain is the passive storage boundary between the WRITE path (Knowledge OS) and the READ path (Context OS). It accepts validated knowledge from Knowledge OS and returns raw items to Context OS. It contains no logic, no filtering, no ranking, and no interpretation.

```
Knowledge OS → Brain → Context OS
```

Brain is an independent top-level package. It depends on nothing. Both Context OS and Knowledge OS depend on it.

**Project location:** `~/Documents/context-os/brain/`

---

## Architecture

### Role

Brain is a storage interface, not an intelligent component. It:

- Accepts `AcceptedKnowledge` from the WRITE path
- Returns `list[ContextItem]` to the READ path
- Makes no decisions about what to store or what to return

Brain does NOT:

- Filter, rank, score, or deduplicate
- Know about `KnowledgeCandidate`, `QualityGate`, `Planner`, `Filter`, or `Composer`
- Modify or interpret stored data
- Apply any selection logic to `read()` queries

### Dependency Graph

```
brain/        →  (nothing)
core/         →  brain/
knowledge_os/ →  brain/
```

No cross-imports between `core/` and `knowledge_os/` are introduced. Brain is the only shared dependency.

---

## Folder Structure

```
~/Documents/context-os/
  core/                     ← Context OS (READ path) — imports from brain/
  adapters/                 ← Context OS adapters — unchanged
  knowledge_os/             ← Knowledge OS (WRITE path) — imports from brain/
  brain/
    __init__.py
    core/
      __init__.py
      brain.py              ← Brain(ABC): write() + read()
      models.py             ← ContextItem, AcceptedKnowledge
    adapters/
      __init__.py
      in_memory.py          ← InMemoryBrain: dict[str, AcceptedKnowledge]
  cli.py
  docs/
```

---

## Data Contracts (`brain/core/models.py`)

Brain owns all types that cross the READ/WRITE boundary. Both types are defined here and imported by other packages. No duplication is permitted.

### `ContextItem`

```python
@dataclass
class ContextItem:
    id: str
    content: str
    source: str
    metadata: dict = field(default_factory=dict)  # reserved — no current consumer
```

Consumed by Context OS (Filter, Composer). Produced by Brain on read.

### `AcceptedKnowledge`

```python
@dataclass
class AcceptedKnowledge:
    id: str
    content: str
    source: str
```

Produced only by `QualityGate` in Knowledge OS. Accepted by Brain on write. `id` is a deterministic `sha256(content + source)[:16]` hash — identical content from the same source always produces the same ID.

### What is NOT in `brain/core/models.py`

`KnowledgeCandidate` is internal to Knowledge OS's ingestion pipeline and never crosses the Brain boundary. It stays in `knowledge_os/core/candidate.py`.

---

## Brain Interface (`brain/core/brain.py`)

```python
from abc import ABC, abstractmethod
from .models import AcceptedKnowledge, ContextItem

class Brain(ABC):
    @abstractmethod
    def write(self, item: AcceptedKnowledge) -> None: ...

    @abstractmethod
    def read(self, query: str | list[str]) -> list[ContextItem]: ...
```

Two abstract methods, no logic, no state. `query` appears in the signature to satisfy the interface contract — concrete implementations are free to ignore it entirely. Write raises on failure. Read returns an empty list for an empty store — not an error.

---

## InMemoryBrain (`brain/adapters/in_memory.py`)

```python
from brain.core.brain import Brain
from brain.core.models import AcceptedKnowledge, ContextItem

class InMemoryBrain(Brain):
    def __init__(self):
        self._store: dict[str, AcceptedKnowledge] = {}

    def write(self, item: AcceptedKnowledge) -> None:
        self._store[item.id] = item

    def read(self, query: str | list[str]) -> list[ContextItem]:
        return [
            ContextItem(id=item.id, content=item.content, source=item.source)
            for item in self._store.values()
        ]
```

Internal storage is a `dict[str, AcceptedKnowledge]` keyed by `item.id`. Dict semantics produce natural deduplication at zero logic cost: a second write with the same ID overwrites with identical data (content-addressable IDs guarantee no information loss). `query` is accepted but unused — all stored items are returned on every read. No persistence; state is lost on process exit. Round-tripping across separate CLI invocations requires a persistent adapter (e.g. `file_brain.py`).

---

## Failure Modes

| Failure | Method | Handling |
|---|---|---|
| Storage error (e.g. memory) | `write()` | Exception propagates to caller |
| Empty store | `read()` | Returns `[]` — not an error |
| Genuine read error | `read()` | Exception propagates to caller |

No retries, no fallback storage, no partial recovery — those are caller concerns.

---

## Determinism

- Same write sequence → same dict state → same read output
- Duplicate writes (same ID) produce no change in stored state
- `dict.values()` ordering in CPython 3.7+ is insertion order — deterministic for a given write sequence

---

## Migration from Existing Specs

> **Note:** The existing Context OS and Knowledge OS specs describe the pre-Brain layout (`core/context_item.py`, `knowledge_os/core/brain.py`, `AcceptedKnowledge` in `knowledge_os/core/candidate.py`, `Retriever` with no Brain dependency). This spec supersedes those conflicting sections. Both existing specs will be updated to reflect the new layout when this migration lands.


### Deletions

| File | Action |
|---|---|
| `core/context_item.py` | Deleted — `ContextItem` moved to `brain/core/models.py` |
| `knowledge_os/core/brain.py` | Deleted — Brain ABC moved to `brain/core/brain.py` |
| `AcceptedKnowledge` in `knowledge_os/core/candidate.py` | Removed — moved to `brain/core/models.py` |

### Context OS changes (`core/`)

`Retriever` gains a Brain constructor dependency — the only behavioral change:

```python
class Retriever:
    def __init__(self, brain: Brain): ...

    def fetch(self, plan: Plan) -> list[ContextItem]:
        return self._brain.read(plan.context_query)
```

`cli.py` constructs `Retriever(brain=brain_instance)`, consistent with existing constructor injection (Approach B). All `ContextItem` imports update to `brain.core.models`. No other Core OS modules change.

### Knowledge OS changes (`knowledge_os/`)

`KnowledgeRuntime` already accepts `brain: Brain` — only the import source changes:

- `from knowledge_os.core.brain import Brain` → `from brain.core.brain import Brain`
- `from knowledge_os.core.candidate import AcceptedKnowledge` → `from brain.core.models import AcceptedKnowledge`

`KnowledgeCandidate` stays in `knowledge_os/core/candidate.py` unchanged.

No logic changes anywhere — only import paths and constructor wiring.

---

## Decoupling Invariants

- `brain/` has no imports from `core/`, `adapters/`, or `knowledge_os/`
- `core/` has no imports from `knowledge_os/`
- `knowledge_os/` has no imports from `core/` or `adapters/`
- `Brain(ABC)` is defined once — in `brain/core/brain.py`
- `ContextItem` and `AcceptedKnowledge` are each defined once — in `brain/core/models.py`

---

## Extensibility Notes

- **New storage backend:** add `brain/adapters/<name>_brain.py`, implement `Brain`. Zero changes to core.
- **Persistence:** a file-backed or database-backed Brain adapter replaces `InMemoryBrain` at the wiring point in `cli.py`. Interface unchanged.
- **Selective reads:** if a future consumer needs filtered reads, add a `BrainReader` wrapper in Context OS — never in Brain itself.

---

## Out of Scope

- Vector databases or embedding-based retrieval
- Ranking, scoring, or deduplication logic in Brain
- Async execution
- Persistence in the in-memory adapter
- Query interpretation of any kind
