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

## Prerequisites

- Node.js ≥ 20 (the Pi extension requires Node 20+; Node 22 LTS is current).
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) — used to install the brain CLI.
- The Pi coding agent: `npm install -g @mariozechner/pi-coding-agent`.

## Install

```bash
pi install git:github.com/algoSiliguri/Agent_OS@v1.1.0
```

That's the entire install. The extension auto-loads when you run `pi`.

## Pick a model in Pi

Pi handles model selection independently of Agent OS. Pick whichever fits your account — Agent OS's slash commands work the same regardless.

**Anthropic (default; what v1.0.0 was tested against):**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

**OpenAI:**
```bash
export OPENAI_API_KEY=sk-...
pi --model gpt-5      # or pick interactively after launch
```

**Interactive provider picker (no env var needed):**
```bash
pi /login
```

**Custom or local models (Ollama, vLLM, LM Studio):**
See [Pi's custom-provider docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md). Configure once at `~/.pi/agent/models.json`.

Switch models any time inside Pi with `/model` or `Ctrl-L`.

## Initialize a project

```bash
cd /path/to/your/repo
pi
> /init my-project
```

`/init` will:

1. Install the brain CLI if it isn't already (via `uv tool install`).
2. Copy the bundled constitution + schemas + contract index into `.agent-os/`.
3. Render `.agent-os/project.yaml` with your project_id, domain, and policy defaults.
4. Create runtime dirs (`runtime/`, `tasks/`).

Optional flags:
- `/init my-project --domain trading-research --critical-actions trade_execute,global_memory_write` — fully scripted (skip prompts).
- `/init --upgrade` — re-copy governance files at the current extension version (preserves your `project.yaml`).
- `/init --force` — overwrite an existing init.

After `/init`, set `BRAIN_DB_PATH` and run `/doctor` to verify:

```bash
export BRAIN_DB_PATH="$HOME/.knowledge-brain/knowledge.db"
```

```
> /doctor
status: ok
```

## Walk the loop

```
> /grill add rate limiting to /api/v1/auth
> /plan
> /run
> /verify
> /remember
> /status
```

For a per-step transcript with expected events, see [docs/demo/section-16-walkthrough.md](docs/demo/section-16-walkthrough.md).

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
