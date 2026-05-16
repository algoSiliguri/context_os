# Pi Runtime Verification Matrix

Status values: **Exists** | **Missing** | **Required** | **Optional** | **Not needed**

Based on test files in `tests/` as of v1.6.1.

---

| Command | Unit test | Integration test | Dev Pi smoke | Prod clean install smoke | Artifact assertions | Event assertions | State assertions |
|---|---|---|---|---|---|---|---|
| `/init` | **Exists** | **Exists** | Optional | **Required** | Optional | Missing | Missing |
| `/doctor` | **Exists** | Missing | **Required** | **Required** | Not needed | Not needed | Not needed |
| `/status` | **Exists** | Missing | Optional | Not needed | Not needed | Missing | **Required** |
| `/grill` | **Exists** | **Exists** | Optional | Not needed | **Required** | Missing | **Required** |
| `/plan` | **Exists** | **Exists** | Optional | Not needed | **Required** | Missing | **Required** |
| `/run` | **Exists** | **Exists** | Optional | Not needed | **Required** | Missing | **Required** |
| `/verify` | **Exists** | Missing | Optional | Not needed | **Required** | Missing | **Required** |
| `/review` | **Missing** | Missing | Optional | Not needed | Missing | Missing | Missing |
| `/evaluate` | **Missing** | Missing | Optional | Not needed | Missing | Missing | Missing |
| `/remember` | **Exists** | Missing | Optional | Not needed | **Required** | Missing | **Required** |
| `/flow` | **Missing** | Missing | **Required** | Not needed | Missing | Missing | Missing |
| `/memory` | Missing | Missing | Optional | Not needed | Not needed | Not needed | Not needed |
| `/continue` | Missing | Missing | Optional | Not needed | Not needed | Not needed | Missing |
| `/diagnose` | **Exists** | Missing | Optional | Not needed | **Required** | Missing | **Required** |
| `/quick-task` | Missing | Missing | Optional | Not needed | Missing | Missing | Missing |
| `/flight` | Missing | Missing | Optional | Not needed | Not needed | Not needed | Not needed |

---

## Commands With Zero Test Coverage

These need at minimum one characterization test before any refactor touches their orchestration logic:

| Command | CCP orchestrator | Pi adapter | Priority |
|---|---|---|---|
| `/review` | `src/ccp/commands/review.ts` | `src/pi/commands/review.ts` | P2 |
| `/evaluate` | `src/ccp/commands/evaluate.ts` | `src/pi/commands/evaluate.ts` | P2 |
| `/flow` | `src/ccp/commands/flow.ts` (uses grill+plan+run+remember internally) | `src/pi/commands/flow.ts` | P1 — composes many commands |
| `/continue` | `src/pi/commands/continue.ts` (Pi-only) | — | P2 |
| `/memory` | `src/pi/commands/memory.ts` (Pi-only) | — | P2 |
| `/quick-task` | `src/ccp/commands/quick-task.ts` | `src/pi/commands/quick-task.ts` | P2 |
| `/flight` | `src/ccp/commands/trace.ts` | `src/pi/commands/flight.ts` | P3 |

---

## Missing Event Assertions

No command currently asserts which events were emitted in tests. This means
`emitAndProject()` calls can be removed or broken without any test catching it.

**Recommended:** Add event assertion to every command's unit test.
Pattern: after calling `runXxx()`, read `events.jsonl` and assert expected
`event_type` values are present in order.

See `src/core/event-log.ts:readEvents()` for the reader to use in tests.

---

## Integration Test Coverage

`tests/integration/section-16-demo.test.ts` is the only test that runs
`/grill → /plan → /run → /remember` as a chain. It is the closest thing
to an end-to-end test.

Key gaps in integration coverage:
- No multi-phase `/flow` test
- No test that a blocking validator prevents phase completion
- No test for brain-unavailable degraded mode in `/remember`
- No test that verifies `/verify` → `/review` → `/evaluate` chain

---

## Prod Clean Install Required

Only `/init` and `/doctor` require prod clean install smoke for every release.
All other commands can be validated with dev Pi smoke or unit tests.

Exception: any story with `Install Impact: install / update / uninstall` requires
prod smoke regardless of which command is affected.
