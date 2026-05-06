# Changelog

## v1.1.0 — 2026-05-DD

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
