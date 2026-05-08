# Changelog

## v1.2.0 — 2026-05-08

### Fixed
- Extension now works with Pi v0.74.0 (`@earendil-works/pi-coding-agent`). Previous versions were written against an older, incompatible Pi API and would silently fail to load.
- `Type.Composite` → `Type.Intersect` in all schema files (Pi bundles typebox v1.1.38 which removed `Type.Composite`).

### Added
- Tier-based tool approval policy on every Pi tool call:
  - Tier 1 (`read`, `grep`, `find`, `ls`) — silent pass.
  - Tier 2 (`edit`, `write`) — confirm once per session, then cached.
  - Tier 3 (`bash`) — confirm on every call.
  - Tier 4 (`sudo`, `.env`, `.ssh` patterns) — hard block.
  - Unknown tools (MCP) — ask once.
- `/grill`, `/plan`, `/run`, `/verify`, `/remember` commands wired to Pi v0.74.0 API.
- `/init` auto-detects project ID from folder name when no argument given.
- `/init` on an already-initialized project auto-upgrades governance files without overwriting `project.yaml`.
- Brain DB stored at `data_store/knowledge.db` inside the project — no `BRAIN_DB_PATH` env var needed.

### Changed
- Pi package name corrected to `@earendil-works/pi-coding-agent` (was `@mariozechner/pi-coding-agent`).
- README simplified for non-developers.

## v1.1.0 — 2026-05-07

### Added
- `/init <project-id>` slash command that scaffolds a greenfield project (governance files, runtime dirs, manifest). Replaces the per-repo `bootstrap-ccp.{sh,ps1}` scripts.
- Bundled governance: constitution + 3 schemas + contract index now ship inside the extension package; no runtime HTTP fetch.
- README sections covering Pi's full provider menu (Anthropic, OpenAI, Google, custom via `~/.pi/agent/models.json`).

### Changed
- `project.yaml.template` moved from `trading-playground/.agent-os/` into the extension at `src/ccp/commands/init/project.yaml.template`.

### Backwards compatibility
- v1.0.0-era projects keep working unchanged. `/init --upgrade` re-copies bundled governance (bytes are byte-identical to v1.0.0; verified by CI). Existing `project.yaml` is never touched by `--upgrade`.

## v1.0.0 — 2026-05-05
Initial release. See `docs/demo/section-16-walkthrough.md` for the demo path.
