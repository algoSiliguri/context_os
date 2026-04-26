#!/usr/bin/env bash
# Sync between the local SQLite DB and the committed JSONL.
#
# Usage:
#   bash scripts/sync.sh export   # DB  → data_store/knowledge.jsonl  (run before commit)
#   bash scripts/sync.sh import   # JSONL → DB                        (run after git pull)

set -euo pipefail

export UV_LINK_MODE=copy

MODE="${1:-}"
if [[ "$MODE" != "export" && "$MODE" != "import" ]]; then
    echo "Usage: bash scripts/sync.sh (export | import)" >&2
    exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYGROUND="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$PLAYGROUND/data_store/knowledge.db"
JSONL_PATH="$PLAYGROUND/data_store/knowledge.jsonl"
BRAIN_GIT_URL="git+https://github.com/agnivadc/knowledge-brain.git"

if [[ "$MODE" == "export" ]]; then
    if [[ ! -f "$DB_PATH" ]]; then
        echo "DB not found at $DB_PATH. Run bootstrap.sh first." >&2
        exit 1
    fi
    uvx --from "$BRAIN_GIT_URL" brain --db-path "$DB_PATH" export "$JSONL_PATH"
else
    if [[ ! -f "$JSONL_PATH" ]]; then
        echo "JSONL not found at $JSONL_PATH." >&2
        exit 1
    fi
    if [[ ! -f "$DB_PATH" ]]; then
        echo "DB not found; will be created during import."
    fi
    uvx --from "$BRAIN_GIT_URL" brain --db-path "$DB_PATH" import "$JSONL_PATH"
fi
