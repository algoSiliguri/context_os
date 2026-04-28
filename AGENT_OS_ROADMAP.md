# AGENT_OS_ROADMAP

Date: 2026-04-28
Scope: `context_os` as a project-agnostic Agent OS control plane.

## Status dashboard

| Area | Completion | Current state | Main gap |
|---|---:|---|---|
| Foundation kernel | 70% | Binding, lock validation, approval derivation, runtime event log, and disk-backed status artifacts exist | Event schema and constitution alignment remain incomplete |
| Visibility | 65% | `status`, `status --watch`, detached fallback, projection-aware summaries, and `doctor` exist | Mismatch explanation and degraded-state reporting are still shallow |
| Enforcement | 35% | Action request hashing, approval derivation, deny flow, and namespace guard exist | No generic execution gate or capability-token enforcement |
| Orchestration | 10% | Registry/spec docs exist | No runtime skill/protocol execution |
| Productization | 10% | Basic CLI entrypoint exists | No guided setup or non-coder diagnostics |

## Sequencing

1. Finish Visibility operator UX on top of truthful runtime artifacts.
2. Return to remaining kernel hardening only where the constitution blocks trustworthy operation.
3. Add real enforcement once operator visibility is credible.

## Next PR-sized slices

### V2.3: Canonical vs projection mismatch dashboard

Priority: P0

Improve `status` to explain when projection history says approved but canonical authority for the current session does not.

### V2.4: Heartbeat and degraded-state reporting

Priority: P1

Add heartbeat emission and expose suspect/degraded transitions in status output.
