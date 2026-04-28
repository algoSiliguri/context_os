# AGENT_OS_ROADMAP

Date: 2026-04-28
Scope: `context_os` as a project-agnostic Agent OS control plane.

## Status dashboard

| Area | Completion | Current state | Main gap |
|---|---:|---|---|
| Foundation kernel | 70% | Binding, lock validation, approval derivation, runtime event log, and disk-backed status artifacts exist | Event schema and constitution alignment remain incomplete |
| Visibility | 92% | `status`, `status --watch`, detached fallback, projection-aware summaries, `doctor`, canonical-vs-projection mismatch explanation, heartbeat health reporting, and constitution-aligned event families exist | Project-agnostic baseline cleanup is still missing |
| Enforcement | 35% | Action request hashing, approval derivation, deny flow, and namespace guard exist | No generic execution gate or capability-token enforcement |
| Orchestration | 10% | Registry/spec docs exist | No runtime skill/protocol execution |
| Productization | 10% | Basic CLI entrypoint exists | No guided setup or non-coder diagnostics |

## Sequencing

1. Finish Visibility operator UX on top of truthful runtime artifacts.
2. Remove domain-specific runtime defaults so the shipped kernel stays project-agnostic.
3. Return to remaining kernel hardening only where the constitution blocks trustworthy operation.
4. Add real enforcement once operator visibility is credible.

## Next PR-sized slices

### V2.5: Constitution event alignment

Priority: Completed

Replace ad hoc runtime event names and envelopes with constitution-aligned canonical event families without pulling in orchestration or enforcement work.

Status: Shipped on `feat/safety-visibility-loop`

### V2.6: Project-agnostic critical-action baseline cleanup

Priority: P1

Remove domain-specific critical actions from the core runtime defaults and keep `context_os` project-agnostic without pulling in orchestration or capability-token enforcement.
