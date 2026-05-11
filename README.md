# @agnivadc/agent-os

A Pi-first, local-first **AI Coding Control Plane**: idea → grill → plan →
approve → execute → verify → remember. Adds governance, state, and a calm
operator surface on top of [Pi](https://github.com/earendil-works/pi).

## What this gives you

Inside `pi`, thirteen slash commands:

| Command | What it does |
|---|---|
| `/init` | Set up Agent OS in your project (run once per project). |
| `/doctor` | Check everything is working. |
| `/grill <idea>` | Answer a few questions to pressure-test your idea. |
| `/diagnose` | Structured bug analysis — 6 prompts → `diagnosis.yaml`. |
| `/plan` | See a plan for the idea and approve or reject it. |
| `/quick-task` | Fast path for trivial tasks with escalation check. |
| `/run` | Record that the plan was executed. |
| `/verify` | Check the plan's success criteria pass. |
| `/review` | Human review of completed work before evaluation. |
| `/evaluate` | Score the task outcome against success criteria. |
| `/remember` | Review and save what was learned to your brain. |
| `/status` | See what task is active and what comes next. |
| `/flight` | Show the Black Box flight recorder timeline for the current session. |

## Prerequisites

- Node.js ≥ 20
- Pi coding agent v0.74.0+: `npm install -g @earendil-works/pi-coding-agent`
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) — used to install the brain CLI (needed for `/remember`)

## Install

```bash
pi install git:github.com/algoSiliguri/Agent_OS@v1.4.0
```

That's the entire install. The extension auto-loads when you run `pi`.

## Pick a model in Pi

Pi handles model selection independently of Agent OS. Pick whichever fits your account — Agent OS's slash commands work the same regardless of which LLM Pi is talking to (Claude, GPT, Gemini, Llama-via-Ollama, anything OpenAI-compatible).

**Anthropic (Claude):**

macOS / Linux:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

Windows (PowerShell):
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
pi
```

**OpenAI (GPT):**

macOS / Linux:
```bash
export OPENAI_API_KEY=sk-...
pi --model gpt-5      # or pick interactively after launch
```

Windows (PowerShell):
```powershell
$env:OPENAI_API_KEY = "sk-..."
pi --model gpt-5
```

**Google (Gemini):**

macOS / Linux:
```bash
export GOOGLE_API_KEY=AIza...
pi --model gemini-2.5-pro
```

Windows (PowerShell):
```powershell
$env:GOOGLE_API_KEY = "AIza..."
pi --model gemini-2.5-pro
```

**Interactive provider picker (no env var needed):**
```bash
pi /login
```

**Custom or local models** (Ollama, vLLM, LM Studio, OpenRouter, Groq, anything OpenAI-compatible):
See [Pi's custom-provider docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md). Configure once at `~/.pi/agent/models.json`.

Switch models any time inside Pi with `/model` or `Ctrl-L`.

### Persisting env vars across shells

| Platform | One-line guide |
|---|---|
| macOS / Linux | Add the `export` lines to `~/.zshrc` (zsh) or `~/.bashrc` (bash). Reload with `source ~/.zshrc`. |
| Windows | `[System.Environment]::SetEnvironmentVariable('VAR_NAME', 'value', 'User')` persists for new shells. Current shell still needs `$env:VAR_NAME = ...`. |

## Set up a project (one time)

```bash
cd /path/to/your/project
pi
```

Inside pi:
```
/init
/doctor
```

`/init` with no arguments automatically uses your folder name as the project ID. It:
1. Installs the brain CLI (via `uv tool install`).
2. Creates `.agent-os/` with governance files and your `project.yaml`.
3. Creates `data_store/knowledge.db` for storing learnings.
4. Creates `runtime/` and `tasks/` directories.

`/doctor` confirms everything is wired up. You should see `status: ok`.

Re-running `/init` on an already-initialized project is safe — it upgrades governance files and leaves your `project.yaml` unchanged.

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

## Observe what happened

Agent OS records every event to a local flight recorder. After any command, run:

```
/flight
```

You will see a timestamped timeline of what happened — state transitions, steps, brain memory operations, verification results — and a health summary.

**Health states:**

| State | Meaning |
|---|---|
| `● HEALTHY` | Session active, events recent |
| `● DONE` | Task completed or aborted |
| `● STUCK` | No events for >90 seconds |
| `● LOOPING` | Same state transition repeated ≥3 times |
| `● FAILED` | Task ended in failure state |

**Where reports are stored:**

```
.agent-os/runtime/sessions/{session_id}/
├── events.jsonl     ← append-only event tape
├── dashboard.json   ← live-projected health snapshot
└── report.md        ← last /flight output as markdown
```

The `/flight` command always shows the most recent session. To view a specific session:

```
/flight <session-uuid>
/flight --tail 20
```

## Architecture

- **Constitution:** `AGENT_OS_CONSTITUTION.md`
- **Domain glossary:** `CONTEXT.md`
- **Observability:** `docs/architecture/observability.md`

## Develop

```bash
npm install
npm test
npm run typecheck
npm run lint
```

## License

TBD
