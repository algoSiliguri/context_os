#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=false
ENABLE_MCP=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --enable-mcp) ENABLE_MCP=true ;;
  esac
done

log() { printf '%s\n' "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "MISSING: $1"
    return 1
  fi
  log "FOUND: $1"
}

require_cmd python3
if $ENABLE_MCP; then
  if command -v uvx >/dev/null 2>&1; then
    log "MCP_STATUS: available"
  else
    log "MCP_STATUS: unavailable (uvx not installed)"
  fi
else
  log "MCP_STATUS: not_configured"
fi

mkdir -p "$ROOT_DIR/.github" "$ROOT_DIR/.agent-os/runtime"

if ! $DRY_RUN; then
  if [[ -f "$ROOT_DIR/.mcp.json.template" ]]; then
    PROJECT_ROOT="$ROOT_DIR" envsubst < "$ROOT_DIR/.mcp.json.template" > "$ROOT_DIR/.mcp.json" || cp "$ROOT_DIR/.mcp.json.template" "$ROOT_DIR/.mcp.json"
    log "WROTE: .mcp.json"
  fi
fi

log "BOOTSTRAP_STATUS: ok"
