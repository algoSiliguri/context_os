#!/usr/bin/env bash
# Shared GitHub Projects v2 board operations.
# Source this file — do not execute directly.
#
# Required env (override if needed):
#   BOARD_OWNER           default: derived from git remote
#   BOARD_PROJECT_NUMBER  default: 1

BOARD_PROJECT_NUMBER="${BOARD_PROJECT_NUMBER:-1}"

_board_owner() {
  if [[ -n "${BOARD_OWNER:-}" ]]; then
    echo "$BOARD_OWNER"
    return
  fi
  gh repo view --json owner --jq .owner.login
}

_board_gql() {
  local query=$1; shift
  gh api graphql -f query="$query" "$@"
}

_board_project_id() {
  local owner
  owner=$(_board_owner)
  _board_gql "{ user(login: \"$owner\") { projectV2(number: $BOARD_PROJECT_NUMBER) { id } } }" \
    --jq '.data.user.projectV2.id'
}

_board_item_id() {
  local issue_number=$1
  local owner
  owner=$(_board_owner)
  _board_gql \
    "{ user(login: \"$owner\") { projectV2(number: $BOARD_PROJECT_NUMBER) { items(first: 200) { nodes { id content { ... on Issue { number } } } } } } }" \
    --jq ".data.user.projectV2.items.nodes[] | select(.content.number == $issue_number) | .id"
}

_board_status_field_and_option() {
  # Prints "<field_id> <option_id>" for the given status name
  local status_name=$1
  local owner
  owner=$(_board_owner)
  _board_gql \
    "{ user(login: \"$owner\") { projectV2(number: $BOARD_PROJECT_NUMBER) { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }" \
    --jq ".data.user.projectV2.fields.nodes[]
          | select(.name == \"Status\")
          | \"\(.id) \(.options[] | select(.name == \"$status_name\") | .id)\""
}

board_move_issue() {
  local issue_number=$1
  local status_name=$2

  local project_id
  project_id=$(_board_project_id)

  local item_id
  item_id=$(_board_item_id "$issue_number")
  if [[ -z "$item_id" ]]; then
    echo "  ⚠  #$issue_number not on board — skipping" >&2
    return 0
  fi

  local ids
  ids=$(_board_status_field_and_option "$status_name")
  local field_id option_id
  field_id=$(echo "$ids" | awk '{print $1}')
  option_id=$(echo "$ids" | awk '{print $2}')

  gh project item-edit \
    --project-id "$project_id" \
    --id "$item_id" \
    --field-id "$field_id" \
    --single-select-option-id "$option_id" > /dev/null

  echo "  ✓ #$issue_number → $status_name"
}
