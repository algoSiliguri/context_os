# engineering-core

A bundled workflow pack adding engineering-discipline workflows on top of the Agent OS governance baseline.

## What's in it

- **Phased `/diagnose`** — 6 sub-phases (build-feedback-loop, reproduce, falsifiable-hypothesis, instrument, fix-at-seam, cleanup) instead of the linear 5-question default. Forces falsifiable hypotheses and tagged-log discipline.
- **Doc-grounded `/grill`** — uses your repo's docs (README, AGENTS.md, CLAUDE.md, etc.) to anchor questions in real terminology.
- **Legacy-safe question pack** — opt-in supplementary grill questions about test seam, blast radius, and rollback path. Useful on unfamiliar codebases.
- **Extra validators** — `validate-falsifiable-hypothesis` enforces "if X then Y" structure in diagnosis hypotheses; `validate-no-stray-debug-tags` greps the repo for stray instrumentation tags after the cleanup phase.

## When to use this pack

- You're doing active engineering work (bug fixing, feature development, refactoring).
- You want guided diagnosis rather than free-form prompts.
- Your codebase is large enough that doc grounding helps anchor conversations.

## When to use agent-os-core instead

- You want the governance baseline only — phase gates, approvals, artifact persistence — without opinionated workflow content.
- You're scripting `/init` in a non-interactive setting and want the minimal install.

## Installing

Run `/init` and pick `engineering-core` when prompted, or `/init --pack engineering-core` to skip the prompt.

## Version

1.0.0 — bundled with Agent OS v1.6.0 and later.
