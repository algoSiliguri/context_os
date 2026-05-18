#!/usr/bin/env bash
set -euo pipefail
# Usage: scripts/story-done.sh
#
# Run from the story branch with all changes committed.
# - Runs npm test + npm run typecheck
# - Pushes branch to origin
# - Creates PR (title from issue, body closes the issue)
# - Moves board card to In Review

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_board.sh
source "$SCRIPT_DIR/_board.sh"

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
BRANCH=$(git branch --show-current)

# Derive issue number from branch (story-009-foo → 9)
ISSUE=$(echo "$BRANCH" | grep -oE 'story-[0-9]+' | grep -oE '[0-9]+' | sed 's/^0*//')
if [[ -z "$ISSUE" ]]; then
  echo "✗ Cannot derive issue number from branch: $BRANCH" >&2
  echo "  Branch must match pattern story-NNN-slug" >&2
  exit 1
fi

# Ensure no uncommitted changes (graphify-out/ is generated and always dirty — excluded)
if ! git diff --quiet -- ':!graphify-out/' || ! git diff --cached --quiet -- ':!graphify-out/'; then
  echo "✗ Uncommitted changes detected — commit everything first" >&2
  exit 1
fi

# Tests
echo "── Tests ─────────────────────────────────────────────"
npm test
npm run typecheck
echo "  ✓ Tests pass"

# Push
echo "── Push ──────────────────────────────────────────────"
git push -u origin "$BRANCH"
echo "  ✓ Pushed"

# PR
echo "── PR ────────────────────────────────────────────────"
TITLE=$(gh issue view "$ISSUE" --repo "$REPO" --json title --jq .title)

PR_URL=$(gh pr create \
  --repo "$REPO" \
  --title "$TITLE" \
  --body "$(printf 'Closes #%s\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)' "$ISSUE")")

echo "  ✓ $PR_URL"

# Board — ensure issue is on the project board, then move
gh project item-add "$BOARD_PROJECT_NUMBER" --owner "$(_board_owner)" \
  --url "https://github.com/${REPO}/issues/${ISSUE}" > /dev/null 2>&1 || true
board_move_issue "$ISSUE" "In Review"

echo ""
echo "Next: review the PR, merge it, then run:"
echo "  scripts/story-close.sh $ISSUE"
