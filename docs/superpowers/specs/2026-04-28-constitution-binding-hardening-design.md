---
title: V3.0 Constitution Binding Hardening
status: approved
date: 2026-04-28
phase: 3
---

## Problem

The runtime emits `BINDING/ACTIVE` without verifying the conditions it claims to have checked. Constitution B3 defines 12 binding conditions (C1–C12); the current implementation satisfies only C1–C3 and C12. Conditions C4, C7, C8, C10, and C11 are unenfenced — tampered constitutions, modified schemas, and unwritable runtime directories go undetected. Every `ACTIVE` claim is hollow until these checks run.

## Goal

Make `bind` either pass all verifiable conditions and emit a trustworthy `ACTIVE`, or fail a specific condition and emit `NOT_ACTIVE` with `failed_condition: Cx`. One PR. No orchestration or capability-token work.

## Failure posture

- **Hard-fail** (C4, C7, C8, C11): binding fails, session never starts, `bind` exits non-zero.
- **Soft-fail / degraded** (C10): session starts as `ACTIVE` with `binding_degraded=True`; status surfaces a `DEGRADED_BINDING` line so operators who missed bind output still discover it.

## Architecture

```
constitution_verifier.py  (new)
  verify_constitution(repo_root) -> VerificationResult

binding.py                (modified)
  bind_project(repo_root)
    1. load manifest
    2. verify_constitution(repo_root)
    3. hard_failed → raise BindingError(condition, detail)
    4. merge result into SessionBindingRecord

models.py                 (modified)
  SessionBindingRecord
    + verification_passed: list[str]
    + verification_soft_failed: list[str]
    + binding_degraded: bool

events.py                 (modified)
  build_binding_event — include conditions_verified, failed_condition, soft_failed, detail

cli.py                    (modified)
  bind_command   — catch BindingError → emit NOT_ACTIVE, exit non-zero
  status_command — show DEGRADED_BINDING block when binding_degraded=True
  doctor         — add Constitution integrity check group
```

## Verification order (short-circuits on hard-fail)

| Step | Condition | Type | What is checked |
|---|---|---|---|
| 1 | C11 | hard-fail | Runtime dirs readable/writable |
| 2 | C4 | hard-fail | SHA256(constitution, content-hash="") == B0.content-hash |
| 3 | C8 | hard-fail | SHA256(contracts/index.json) == B0.contract-index-hash |
| 4 | C7 | hard-fail | B0 header validates against constitution-binding.schema.json |
| 5 | C10 | soft-fail | Telemetry + permission schemas parse without error |

## Data shapes

**`VerificationResult`:**
```python
@dataclass
class VerificationResult:
    passed: list[str]
    hard_failed: str | None      # first failing condition id, or None
    soft_failed: list[str]       # C10 accumulates here
    detail: str | None           # human-readable reason on failure
```

**`SessionBindingRecord` additions:**
```python
verification_passed: list[str] = Field(default_factory=list)
verification_soft_failed: list[str] = Field(default_factory=list)
binding_degraded: bool = False
```

**BINDING event payload additions:**
```json
{
  "conditions_verified": ["C4", "C7", "C8", "C10", "C11"],
  "failed_condition": null,
  "soft_failed": [],
  "detail": null
}
```

## UX

**Hard-fail at bind time:**
```
ERROR  Binding failed: C4 — constitution content-hash mismatch.
       Expected: 386ee4a8...  Got: a1b2c3d4...
       The constitution file may have been modified. Resolve before binding.
exit 1
```

**Status when degraded:**
```
session:    sess-abc123
state:      ACTIVE
heartbeat:  ACTIVE (last seen 8s ago)

DEGRADED_BINDING  C10 schema load failed — telemetry/permission schemas
                  could not be validated. Run `context-os doctor` for details.
```

**Doctor additions:**
- New `Constitution integrity` check group
- One row per C4/C7/C8/C10/C11 with OK/WARN/FAIL and plain-language next steps
- Reads from active session record if bound; re-runs checks if detached

## Testing surface

**`tests/test_constitution_verifier.py` (new):**
- C11 pass and fail (missing dir)
- C4 pass and fail (modified constitution)
- C8 pass and fail (modified index.json)
- C7 pass and fail (malformed B0 header)
- C10 soft-fail (malformed schema file)
- Short-circuit: C4 fail stops evaluation before C8/C7/C10

**`tests/test_binding.py` additions:**
- Hard-fail propagates as `BindingError`
- Degraded propagates as `binding_degraded=True` on record

**`tests/test_cli.py` additions:**
- `bind` exits non-zero and emits `BINDING/NOT_ACTIVE` on hard-fail
- `status` includes `DEGRADED_BINDING` block when degraded
- `doctor` shows constitution integrity check group

## Dependencies

- `jsonschema` (already in project) required for C7 and C10 schema validation.
- `hashlib` (stdlib) for C4 and C8 SHA256 recomputation.

## Out of scope

- C9 (signature verification) — `signature-required=false` in current constitution
- Capability-token enforcement (B9)
- Orchestration or skill registry work
