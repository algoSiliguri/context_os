#!/usr/bin/env bash
set -euo pipefail
# Usage: scripts/story-start.sh <issue-number>
#
# - Derives branch name from issue title
# - Creates and checks out the branch
# - Moves board card to In Progress
# - Prints the full issue (acceptance criteria)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_board.sh
source "$SCRIPT_DIR/_board.sh"

ISSUE=${1:?"Usage: $0 <issue-number>"}
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Enforce clean main
CURRENT=$(git branch --show-current)
if [[ "$CURRENT" != "main" ]]; then
  echo "✗ Must be on main (currently: $CURRENT)" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ Working tree is not clean — commit or stash first" >&2
  exit 1
fi

# Pull latest
git pull --ff-only origin main --quiet

# Derive branch name
TITLE=$(gh issue view "$ISSUE" --repo "$REPO" --json title --jq .title)
SLUG=$(echo "$TITLE" \
  | sed 's/^[A-Z]*-[0-9]*: *//' \
  | tr '[:upper:]' '[:lower:]' \
  | tr -cs 'a-z0-9' '-' \
  | sed 's/--*/-/g; s/^-//; s/-$//' \
  | cut -c1-40)
PADDED=$(printf '%03d' "$ISSUE")
BRANCH="story-${PADDED}-${SLUG}"

git checkout -b "$BRANCH"
echo "  ✓ Branch: $BRANCH"

# Board
board_move_issue "$ISSUE" "In Progress"

echo ""
echo "══ Acceptance criteria ══════════════════════════════"
gh issue view "$ISSUE" --repo "$REPO"
