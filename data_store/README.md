# data_store

Project-scoped knowledge DB for Agent OS L3 memory.

For personal use, prefer `~/.knowledge-brain/knowledge.db` (global across all projects).
Use this directory only when a team needs a shared DB committed to the repo.

- `knowledge.jsonl` - committed export snapshot, human-readable diff
- `knowledge.db` - gitignored, rebuilt locally from the JSONL via `brain import`
