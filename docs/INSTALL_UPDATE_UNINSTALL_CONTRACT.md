# Install / Update / Uninstall Contract

This document defines what Agent_OS creates, what it owns, what the user owns,
and how to safely install, update, and remove it from a project.

---

## What /init Creates

Run `/init` once per project. It creates:

```
<project-root>/
  .agent-os/
    project.yaml                ← USER-OWNED. Created by /init. Not overwritten on update.
    contracts/
      index.json                ← generated. Overwritten on update.
      signature.json            ← generated. Overwritten on update.
    schemas/
      constitution-binding.schema.json   ← bundled. Overwritten on update.
      permission-manifest.schema.json    ← bundled. Overwritten on update.
      project-binding.schema.json        ← bundled. Overwritten on update.
      session-binding-record.schema.json ← bundled. Overwritten on update.
      telemetry-event.schema.json        ← bundled. Overwritten on update.
    packs/
      <pack-id>/                ← bundled pack. Overwritten on update.
    runtime/                    ← generated at runtime. Not touched by /init.
    tasks/                      ← generated at runtime. Not touched by /init.
  data_store/
    knowledge.db                ← USER-OWNED. Brain knowledge database.
  AGENT_OS_CONSTITUTION.md      ← bundled governance. Overwritten on update.
  CLAUDE.md                     ← bundled governance. Overwritten on update.
  AGENTS.md                     ← bundled governance. Overwritten on update.
```

**User-owned files** (never overwritten without explicit user action):
- `.agent-os/project.yaml`
- `data_store/knowledge.db`
- Any files the user created manually in the project

**Generated/bundled files** (safe to overwrite on update):
- Everything else listed above

---

## Install

### Prerequisites
- Node.js ≥ 20
- Pi coding agent v0.74.0+
- `uv` (for brain CLI installation)

### Install steps (via agent-os-starter)
```bash
git clone https://github.com/algoSiliguri/agent-os-starter.git
cd agent-os-starter
bash setup.sh
```

### Verify install
Run in any project:
```
/init
/doctor
```

`/doctor` must show:
- `status: ok`
- `source_mode: installed` (not `source`)
- Version matches expected release

### Install smoke test
See `docs/DEV_PROD_ENVIRONMENTS.md` for the prod clean install smoke procedure.

---

## Update

Re-running `/init` on an already-initialized project is safe:
- Governance files and schemas are upgraded to the bundled version
- `.agent-os/project.yaml` is **not** overwritten
- `data_store/knowledge.db` is **not** touched
- Runtime state (`.agent-os/runtime/`, `.agent-os/tasks/`) is **not** touched

### Update steps
```bash
# 1. Update Agent_OS to new version (via agent-os-starter or local path)
# 2. In the target project, run Pi:
/init
/doctor
```

### What to verify after update
- `/doctor` shows new version
- `/doctor` shows `status: ok`
- `.agent-os/project.yaml` is unchanged (check with git diff)
- No errors during `/init`

### Update smoke test (if install-impacted change)
```bash
# 1. Install old version in /tmp/smoke-update-<ts>/sample-project/
# 2. Run /init, /doctor, capture project.yaml content
# 3. Update to new version
# 4. Re-run /init
# 5. Assert: project.yaml unchanged, /doctor ok, new version visible
```

---

## Uninstall

### Safe uninstall (removes generated files, preserves user work)

Removes everything Agent_OS installed except user-owned files.

```bash
# From inside the project root:
rm -rf .agent-os/contracts/
rm -rf .agent-os/schemas/
rm -rf .agent-os/packs/
rm -rf .agent-os/runtime/
rm -rf .agent-os/tasks/
rm -f AGENT_OS_CONSTITUTION.md
rm -f CLAUDE.md
rm -f AGENTS.md
# .agent-os/project.yaml is preserved
# data_store/ is preserved
```

After safe uninstall: `.agent-os/project.yaml` and `data_store/knowledge.db` remain.

### Full purge (removes all Agent_OS state including user-owned files)

**Warning:** This removes your project configuration and brain knowledge database.
This cannot be undone unless you have backups.

```bash
rm -rf .agent-os/
rm -rf data_store/
rm -f AGENT_OS_CONSTITUTION.md
rm -f CLAUDE.md
rm -f AGENTS.md
```

### Idempotency

Both safe uninstall and full purge are idempotent. Running them twice produces
the same result.

### What was removed / what was kept

After **safe uninstall**, the project is in a state where:
- Agent_OS slash commands will no longer load (no governance files)
- Your `project.yaml` config is preserved if you reinstall later
- Your brain knowledge database is preserved

After **full purge**, the project has no trace of Agent_OS.

---

## Current Gaps (known debt as of v1.6.1)

| Gap | Risk | Tracking |
|---|---|---|
| No install manifest written by `/init` (no file listing what was created) | P2 | Future story |
| No automated update smoke test | P1 | STORY-009 |
| No `--dry-run` for safe uninstall | P3 | Future story |
| `agent-os-starter` tag not published per README | P1 | Release process |
