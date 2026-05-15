# Narration tags

This file is the canonical reference for every narration tag emitted by Agent OS. The narrator module is at `src/core/narrator.ts`; wiring is in `src/pi/extension.ts`.

Format: `[tag] one-line human-readable message`.

## Tag inventory

| Tag | When emitted | Example output |
|---|---|---|
| `[pack]` | Pack load, ignore, load-failure, prompt warnings, version state | `[pack] engineering-core v1.0.0 loaded` |
| `[phase]` | Task-lifecycle state transitions | `[phase] NEW_IDEA → GRILLING` |
| `[doc]` | Doc-detector results consumed by /grill | `[doc] using AGENTS.md, CLAUDE.md as grounding sources` |
| `[validator]` | Validator pass/findings from runValidatorsForPhase | `[validator] validate-artifact passed` |
| `[step]` | Plan step start/complete/fail during /run | `[step] S-001: edit src/foo.ts (approval tier 2)` |
| `[memory]` | Memory candidate proposed/approved/declined | `[memory] 3 candidates pending approval` |
| `[plan]` | Plan-drafter detected verification command | `[plan] detected verification: pytest (pyproject.toml)` |
| `[verify]` | Verification command start/result | `[verify] running 3 verification commands` |
| `[review]` | Human-review boundaries | `[review] awaiting human review` |
| `[evaluate]` | Evaluation outcome | `[evaluate] outcome: PASS (criteria=1.0)` |
| `[doctor]` | Each doctor check result + overall status | `[doctor] Constitution: pass` |
| `[trace]` | Reserved for future use; not currently emitted | — |

## Where each tag is wired

| Tag | Source location |
|---|---|
| `[pack]` | `src/pi/extension.ts` `ensurePacksLoaded` (Phase 1) |
| `[phase]` | `src/pi/extension.ts` — all command handlers after `transitionTaskLifecycle` |
| `[doc]` | `src/pi/extension.ts` `buildGrillGenerator` after `detectDocs` |
| `[validator]` | `src/pi/extension.ts` `runPackValidators` (Phase 1) |
| `[step]` | `src/pi/extension.ts` `/run` handler (via narrating StepExecutor wrapper) |
| `[memory]` | `src/pi/extension.ts` `/remember` handler (entry/exit) |
| `[plan]` | `src/pi/extension.ts` `/plan` handler (capturing drafter wrapper) |
| `[verify]` | `src/pi/extension.ts` `/verify` handler (entry/exit) |
| `[review]` | `src/pi/extension.ts` `/review` handler (entry/exit) |
| `[evaluate]` | `src/pi/extension.ts` `/evaluate` handler (entry/exit) |
| `[doctor]` | `src/pi/extension.ts` `/doctor` handler (per-check + overall) |

## Coverage guarantee

`tests/unit/narrator-coverage.test.ts` is a CI gate. It fails if any required tag is missing from `extension.ts`. The list of required tags is enumerated in that test file.

## Adding a new tag

1. Add the tag to `NarrationTag` and `ALLOWED_TAGS` in `src/core/narrator.ts`.
2. Add a row to the "Tag inventory" table above.
3. Add the tag to `REQUIRED_TAGS` in `tests/unit/narrator-coverage.test.ts`.
4. Wire the tag at the appropriate site in `extension.ts` (or wherever else it belongs).
5. Update the "Where each tag is wired" table.

## Notes on style

- Each narration line MUST be a single line (the narrator collapses internal newlines).
- Messages should be concrete and read like a log entry — not a sentence with punctuation.
- ANSI codes are NOT injected by the narrator; they're added by `ui.notify` consumers if a color scheme is active.
- Tags are stable contracts. Once a tag is in the inventory, downstream tooling (greps, dashboards) may depend on it. Don't rename a tag without bumping a major Agent_OS version.
