#!/usr/bin/env bash
set -euo pipefail
# Usage: scripts/story-close.sh <issue-number>
#
# Run after the PR is merged.
# Routes board card based on risk and install-impact labels:
#   risk: p3  + install impact: none  → Done
#   anything else                     → Dev Verified

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_board.sh
source "$SCRIPT_DIR/_board.sh"

ISSUE=${1:?"Usage: $0 <issue-number>"}
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Read labels
LABELS=$(gh issue view "$ISSUE" --repo "$REPO" --json labels --jq '[.labels[].name] | join(" ")')

RISK="unknown"
for level in p0 p1 p2 p3; do
  if echo "$LABELS" | grep -q "risk: $level"; then
    RISK="$level"
    break
  fi
done

INSTALL="none"
if echo "$LABELS" | grep -qE 'install impact: (install|update|uninstall|packaging)'; then
  INSTALL="install"
fi

# Route
if [[ "$RISK" == "p3" && "$INSTALL" == "none" ]]; then
  TARGET="Done"
else
  TARGET="Dev Verified"
fi

echo "  risk=$RISK  install=$INSTALL  → $TARGET"
board_move_issue "$ISSUE" "$TARGET"

# Return to main
git checkout main
git pull --ff-only origin main --quiet
echo "  ✓ Back on main"
