# Knowledge OS — Design Spec
**Date:** 2026-04-22

---

## Overview

Knowledge OS is the WRITE path of the Context-First AI System. It is a deterministic, synchronous control layer responsible for deciding what information is allowed to be stored in the Brain.

It complements Context OS (the READ path) and together they form:

```
WRITE (Knowledge OS) → Brain → READ (Context OS)
```

Knowledge OS performs no reads from the Brain. Context OS performs no writes to the Brain. The two systems share only the underlying storage — never modules, never imports.

**Project location:** `~/Documents/context-os/knowledge_os/`

---

## Architecture

### Pipeline

```
cli.py / adapter
  └── KnowledgeRuntime.run(candidate)
        ├── Ingestion.normalize(candidate)   → KnowledgeCandidate  (normalized)
        ├── QualityGate.validate(normalized) → AcceptedKnowledge
        └── Brain.write(accepted)            → None
```

Every stage communicates exclusively via typed return values. No shared state, no global variables, no side channels. Runtime is a thin three-line orchestrator — all behavior lives in injected modules.

### Approach: Class-based constructor injection (mirrors Context OS Approach B)

- Each pipeline stage is a class with one public method.
- Runtime receives instances, not imports. Concrete classes are named only in `cli.py`.
- Adapters produce `KnowledgeCandidate` from source-specific inputs. The pipeline is source-agnostic.

---

## Folder Structure

```
~/Documents/context-os/
  core/                         ← Context OS (READ path) — untouched
  adapters/                     ← Context OS adapters — untouched
  cli.py                        ← Context OS CLI — untouched

  knowledge_os/                 ← Knowledge OS (WRITE path)
    core/
      __init__.py
      candidate.py              ← KnowledgeCandidate, AcceptedKnowledge
      ingestion.py              ← Ingestion
      quality_gate.py           ← QualityGate
      brain.py                  ← Brain (ABC — write interface only)
      runtime.py                ← KnowledgeRuntime
    adapters/
      __init__.py
      file_brain.py             ← concrete Brain: writes to flat file
      cli_adapter.py            ← stdin/args → KnowledgeCandidate
      file_adapter.py           ← file path → KnowledgeCandidate
      agent_adapter.py          ← agent output string → KnowledgeCandidate
    cli.py                      ← entry point; names concrete classes
```

No module in `knowledge_os/` imports from `core/` or `adapters/`. No module in `core/` or `adapters/` imports from `knowledge_os/`. Decoupling is enforced by import boundary, not convention.

---

## Data Contracts

### `KnowledgeCandidate`

```python
@dataclass
class KnowledgeCandidate:
    content: str   # Ingestion: normalize; QualityGate: validate non-empty
    source: str    # Ingestion: normalize; QualityGate: validate non-empty
```

Produced by adapters. Has no `id` — callers do not assign IDs. Carries no invariant guarantees; may contain whitespace-only strings before normalization.

### `AcceptedKnowledge`

```python
@dataclass
class AcceptedKnowledge:
    id: str        # Brain: storage key; future READ path: maps to ContextItem.id
    content: str   # Brain: stored verbatim; future READ path: ContextItem.content
    source: str    # Brain: stored verbatim; future READ path: ContextItem.source
```

Produced only by `QualityGate.validate()`. No other module constructs this type. `Brain.write()` accepts only `AcceptedKnowledge` — bypassing the gate is structurally impossible.

`id` is generated deterministically as `sha256(content + source)[:16]`. Identical content from the same source produces the same id — a natural future deduplication key at zero extra cost.

**Deferred fields:** `metadata` — no current consumer. May be added when the READ path's `ContextItem.metadata` gains a named consumer.

### Field Ownership

| Field | Ingestion | QualityGate | Brain |
|---|---|---|---|
| `candidate.content` | normalize | validate | — |
| `candidate.source` | normalize | validate | — |
| `accepted.id` | — | generate | store |
| `accepted.content` | — | carry forward | store |
| `accepted.source` | — | carry forward | store |

No module reads outside its column.

---

## Core Module Interfaces

```python
class Ingestion:
    def normalize(self, candidate: KnowledgeCandidate) -> KnowledgeCandidate: ...

class QualityGate:
    def validate(self, candidate: KnowledgeCandidate) -> AcceptedKnowledge: ...

class Brain(ABC):
    def write(self, knowledge: AcceptedKnowledge) -> None: ...

class KnowledgeRuntime:
    def __init__(self, ingestion: Ingestion, quality_gate: QualityGate, brain: Brain): ...
    def run(self, candidate: KnowledgeCandidate) -> None: ...
```

---

## Module Implementations (scaffold)

### Ingestion

Strips leading/trailing whitespace from `content` and `source`. Returns a new `KnowledgeCandidate` — no mutation of input.

### QualityGate

Raises `ValueError` if `content` or `source` is empty after normalization. Generates `id = sha256(content + source)[:16]`. Returns `AcceptedKnowledge`. This is the only place in the system that constructs `AcceptedKnowledge`.

### Brain (abstract)

Abstract base class defining the write interface only. No logic, no filtering, no validation. Concrete implementations live in `adapters/`.

### KnowledgeRuntime

```python
def run(self, candidate: KnowledgeCandidate) -> None:
    normalized = self.ingestion.normalize(candidate)
    accepted   = self.quality_gate.validate(normalized)
    self.brain.write(accepted)
```

Three lines, no branching. Failures propagate as exceptions.

---

## Adapter Layer

### Source Adapters (produce `KnowledgeCandidate`)

All source-specific logic lives here. The pipeline never sees origin.

| Adapter | Input | Output |
|---|---|---|
| `cli_adapter.py` | stdin or CLI args | `KnowledgeCandidate` |
| `file_adapter.py` | file path (reads content) | `KnowledgeCandidate` |
| `agent_adapter.py` | agent output string | `KnowledgeCandidate` |

Adding a new source = one new adapter file, zero changes to core.

### Brain Adapters (implement `Brain`)

| Adapter | Storage mechanism |
|---|---|
| `file_brain.py` | appends to a flat JSONL file |

Adding a new storage backend = one new adapter file, zero changes to core.

---

## CLI

```bash
python knowledge_os/cli.py write "content here" --source "manual"
python knowledge_os/cli.py write --file path/to/doc.txt --source "file"
```

`argparse`-based. Runtime is constructed fresh per invocation. Concrete classes named only here.

---

## Failure Modes

| Failure | Stage | Exception | Handling |
|---|---|---|---|
| Empty `content` or `source` | `QualityGate.validate()` | `ValueError` | Propagates to CLI — printed as error, non-zero exit |
| Storage failure | `Brain.write()` | `IOError` | Propagates to CLI — printed as error, non-zero exit |

No retry, no fallback, no partial recovery — those are caller concerns.

**Edge case:** whitespace-only `content` or `source` is normalized to `""` by `Ingestion`, then caught as empty by `QualityGate`. No special case required.

---

## Decoupling Invariants

- `knowledge_os/core/` has no imports from `core/` or `adapters/` (Context OS).
- `core/` and `adapters/` (Context OS) have no imports from `knowledge_os/`.
- `Brain` (write interface) and the Retriever's storage interface (READ path) are separate — they share underlying storage only at runtime via concrete adapter, not via shared code.
- `Ingestion` has no imports from `QualityGate`.
- `QualityGate` has no imports from `Ingestion` or `Brain`.
- `KnowledgeRuntime` imports no concrete adapter — only abstract `Brain`.

---

## Extensibility Notes

- **New source:** add `knowledge_os/adapters/<source>_adapter.py`, wire in `cli.py`.
- **New storage backend:** add `knowledge_os/adapters/<name>_brain.py`, register in `cli.py`.
- **Deduplication:** add a `Deduplicator` stage between `QualityGate` and `Brain`; its method receives `AcceptedKnowledge` and returns `AcceptedKnowledge` or raises.
- **Normalization rules:** extend `Ingestion.normalize()` body — interface unchanged.

---

## Out of Scope

- Scoring, ranking, or ML-based quality judgments
- Duplicate detection (deferred — no current consumer)
- Vector database or storage engine design
- Memory, sessions, or history abstractions
- Async execution
- READ path integration (Context OS Retriever is a separate concern)
