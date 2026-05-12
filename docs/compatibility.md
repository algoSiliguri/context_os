# Agent_OS Compatibility Matrix

_Last updated: 2026-05-12. Update this file whenever a version pin changes._

---

## Component versions — RC.1 (current)

| Component | Version | Install method | Source |
|---|---|---|---|
| Agent_OS Pi extension | `v1.4.0` | `pi install git:github.com/algoSiliguri/Agent_OS@v1.4.0` | algoSiliguri/Agent_OS |
| knowledge-brain CLI | `v1.0.0` | `uv tool install git+https://github.com/agnivadc/knowledge-brain.git@v1.0.0` | agnivadc/knowledge-brain |
| Pi coding agent | `v0.74.0` minimum | `npm install -g @earendil-works/pi-coding-agent` | npm |
| Node.js | `20+` | system install | nodejs.org |
| Python | `3.12+` | system install | python.org |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | astral.sh |

---

## Compatibility rules

| Agent_OS | Pi minimum | knowledge-brain | Notes |
|---|---|---|---|
| v1.4.x | v0.74.0 | v1.0.0 | RC.1 baseline |

- Agent_OS `v1.x` requires Pi `≥v0.74.0`. Earlier Pi versions lack `registerCommand` and `on('tool_call')`.
- Agent_OS `v1.x` requires knowledge-brain `v1.0.0`. Protocol version verified via `brain --protocol-version` (returns `1.0.0`).
- `setup.sh` enforces Pi `≥v0.74.0` at install time and records the detected Pi version in `install-manifest.json`.

---

## Version scheme note

Each component uses its own versioning scheme:

- **Agent_OS**: npm package version (`1.4.0`) matches the git tag (`v1.4.0`). The product milestone is `v1.0.0`.
- **knowledge-brain**: Python package version (`1.0.0`) matches the git tag (`v1.0.0`). `brain --version` → `knowledge-brain 1.0.0`. `brain --protocol-version` → `1.0.0`.
- **agent-os-starter**: no package version — it is a scripts/config repo. Version is tracked via `install-manifest.json` `installed_at` timestamp.

---

## Checking your installed versions

Inside Pi:
```
/doctor
```

From the shell:
```bash
pi --version           # e.g. 0.74.0
brain --version        # e.g. knowledge-brain 1.0.0
brain --protocol-version  # e.g. 1.0.0
node --version         # e.g. v22.x.x
cat .agent-os/install-manifest.json  # full install record
```

---

## What setup.sh installs (and where)

| What | Where | Global/local | Reversible |
|---|---|---|---|
| uv | `~/.local/bin/uv` | user-global | `rm ~/.local/bin/uv` |
| brain CLI | uv tool store (`~/.local/share/uv/tools/knowledge-brain/`) | user-global | `uv tool uninstall knowledge-brain` |
| Agent_OS Pi extension | Pi extension registry (Pi-managed) | user-global (Pi) | `pi uninstall agent-os` |
| install-manifest.json | `.agent-os/install-manifest.json` | project-local | `rm .agent-os/install-manifest.json` |
| brain DB | `data_store/knowledge.db` (or `$BRAIN_DB_PATH`) | project-local (default) | `rm data_store/knowledge.db` (irreversible — data lost) |

---

## Upgrade path (v1.x)

To upgrade Agent_OS extension:
```bash
# In setup.sh, update AGENT_OS_EXTENSION to new tag, then re-run:
bash setup.sh
# Then inside Pi:
/init --upgrade   # refreshes governance files, preserves project.yaml
/doctor           # verify
```

To upgrade knowledge-brain:
```bash
# In setup.sh, update BRAIN_GIT_URL to new tag, then re-run:
bash setup.sh
```

---

## Reset / uninstall

```bash
# Remove Pi extension (affects all projects on this machine)
pi uninstall agent-os

# Remove brain CLI (affects all projects on this machine)
uv tool uninstall knowledge-brain

# Remove project data only (irreversible)
rm -rf .agent-os/ data_store/
```

`.agent-os/` and `data_store/` are gitignored by default. Verify before deleting.
