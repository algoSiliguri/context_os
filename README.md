# @agnivadc/agent-os

A Pi-first, local-first **AI Coding Control Plane**: idea → grill → plan →
approve → execute → verify → remember. Adds governance, state, and a calm
operator surface on top of [Pi](https://github.com/badlogic/pi-mono).

## What this gives you

Inside `pi`, six new slash commands:

| Command | What it does |
|---|---|
| `/grill <idea>` | Pressure-tests the idea with structured questions. Writes a `GrillRecord`. |
| `/plan` | Drafts a bounded plan from the grill output. Asks for approval. |
| `/run [<task>] [--resume]` | Executes the approved plan with policy-gated tool calls. |
| `/verify` | Runs the plan's verification commands; auto-chains from `/run`. |
| `/remember` | Reviews and persists captured knowledge to your brain. |
| `/status [<task>]` | Compact read-only view of current state. |

Plus `/doctor` to debug your setup.

## Install

```bash
pi install npm:@agnivadc/agent-os
```

## Bind a project

Create `.agent-os/project.yaml`:

```yaml
project_id: my-project
domain_type: general
runtime_version: 0.1.0
memory_namespace: my-project
verification_profile: default
critical_actions: []
workspace:
  root: .

# Optional CCP policy fields:
overrides:
  - tool: write_file
    when: "path within workspace.root"
    tier: 1
trust_registry:
  pi_packages:
    - package: "@agnivadc/agent-os"
      trust: trusted
```

Run `pi`, then `/doctor` to confirm everything's wired.

## Walkthrough

See `docs/demo/section-16-walkthrough.md` for a step-by-step demo of the
v1 loop on a real codebase.

## Architecture

- **Spec:** `project/docs/superpowers/specs/2026-05-03-agent-os-ccp-v1-design.md`
- **Constitution:** `AGENT_OS_CONSTITUTION.md` (governance, version-bound)
- **Domain glossary:** `CONTEXT.md`

## Develop

```bash
npm install
npm test
npm run typecheck
npm run lint
```

## License

TBD
