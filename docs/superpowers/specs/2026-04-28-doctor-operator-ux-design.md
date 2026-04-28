# Doctor Operator UX Design

Date: 2026-04-28
Status: Proposed
Scope: `context_os` Phase 2 Visibility slice for a non-coder-friendly `context-os doctor` command

## 1. Purpose

Define the smallest useful `doctor` command for `context_os` that helps a non-coder understand whether the local Agent OS setup is healthy and what to do next when it is not.

This slice stays within Phase 2 Visibility. It does not add enforcement, orchestration, or domain-specific behavior.

## 2. Problem Statement

The current runtime assumes an operator can infer system health by reading repository files, lock semantics, event logs, and projection storage behavior directly. That is not acceptable for a project-agnostic control plane intended to be usable by non-coders.

The current repo has:

- a manifest model
- lock validation
- canonical runtime artifact paths
- a bundle verification script
- projection storage helpers

But it does not have one plain-language command that explains:

- whether the project is bound correctly
- whether the runtime files are present and readable
- whether the approval visibility substrate is reachable
- what concrete action an operator should take next

## 3. Design Decision

Add `context-os doctor` as a human-first diagnostic command with machine-friendly exit codes underneath.

The command will:

- print a short summary first
- print named checks with `OK`, `WARN`, or `FAIL`
- explain each failed or degraded check in plain language
- end with a short “What to do next” section

The command must remain project-agnostic. It cannot mention trading workflows, deployment pipelines, or any consumer-specific operation.

## 4. Operator Experience

### 4.1 Output shape

The command output should have three sections in this order:

1. Health summary
2. Check results
3. What to do next

Example shape:

```text
Agent OS doctor: ATTENTION NEEDED

OK    Project manifest loaded
OK    Canonical runtime log is readable
WARN  No active lock found
FAIL  Bundle verification failed

What to do next:
- Run `context-os bind` in this repository to create an active session.
- Fix the bundle verification errors above before relying on Agent OS authority.
```

### 4.2 Severity model

- `OK`: check passed
- `WARN`: degraded or missing optional state, but the repo is still understandable
- `FAIL`: blocking condition that prevents trustworthy operation

### 4.3 Non-coder language rules

- no stack traces in normal output
- no raw exception dumps unless a future debug mode is added
- each non-OK result must include one concrete remediation sentence
- phrasing must describe intent, not internals where possible

Good:
- `No active lock found. Run context-os bind in this repository to start a new session.`

Bad:
- `LockRecord validation returned repo_mismatch`

## 5. Initial Checks

This slice includes only the following checks.

### 5.1 Manifest check

Validate that `.agent-os.yaml` exists and parses through the runtime manifest loader.

Severity:
- missing or invalid manifest -> `FAIL`

Remediation:
- tell the operator that the project is not configured and they need a valid `.agent-os.yaml`

### 5.2 Active lock check

If `.agent-os.lock` exists, validate it against the current repo and canonical event log.

Severity:
- valid lock -> `OK`
- missing lock -> `WARN`
- invalid lock -> `WARN`

Rationale:
- detached visibility is acceptable in Phase 2
- missing or stale lock should not be treated as total failure for a read-only diagnostic

Remediation:
- suggest `context-os bind` when there is no valid active session

### 5.3 Canonical runtime directory check

Validate `.agent-os/runtime/` exists when runtime artifacts are expected.

Severity:
- runtime dir missing with no lock and no event history -> `WARN`
- runtime dir missing while lock exists -> `FAIL`

### 5.4 Canonical event log check

Validate `.agent-os/runtime/events.jsonl` exists and is readable.

Severity:
- readable log -> `OK`
- missing log with no active session -> `WARN`
- missing or unreadable log with active lock -> `FAIL`

### 5.5 Session snapshot check

Validate `.agent-os/runtime/session.json` when present.

Severity:
- readable snapshot -> `OK`
- missing snapshot with active lock -> `WARN`
- unreadable snapshot -> `WARN`

Rationale:
- the snapshot is useful operator context, but the canonical log remains primary

### 5.6 Projection database reachability check

Use the existing memory route logic to resolve the project projection DB path and verify that the parent directory is writable and the DB is readable if present.

Severity:
- reachable path / readable DB -> `OK`
- missing DB file but writable path -> `WARN`
- inaccessible path -> `WARN`

Rationale:
- projection visibility is best-effort in current architecture

### 5.7 Brain CLI availability check

Detect whether the `brain` CLI is available on `PATH`.

Severity:
- available -> `OK`
- unavailable -> `WARN`

Rationale:
- helpful for local operator workflows, but not required for runtime authority

### 5.8 Bundle verification check

Run the local Agent OS bundle verifier from the repo root.

Severity:
- verifier passes -> `OK`
- verifier fails -> `FAIL`

Rationale:
- authority credibility depends on the governing bundle being intact

## 6. Summary Rules

The top summary line should collapse the checks into one of these states:

- `HEALTHY`: all checks are `OK`
- `ATTENTION NEEDED`: one or more `WARN`, no `FAIL`
- `BLOCKED`: one or more `FAIL`

## 7. Exit Code Rules

The command is human-first, but it should still support automation.

- exit `0`: only `OK` and `WARN`
- exit non-zero: any `FAIL`

This keeps the UX simple for non-coders while preserving basic scripting value.

## 8. Architecture

Add a small diagnostic layer rather than packing all logic into `cli.py`.

Recommended units:

- `context_os_runtime/doctor.py`
  - defines the check model
  - runs checks
  - computes summary and exit code
- `context_os_runtime/cli.py`
  - adds the `doctor` subcommand
  - renders doctor output

The check model should be simple:

- check name
- severity
- explanation
- remediation

This file boundary keeps `status` and `doctor` separate even though they share some runtime-path and manifest helpers.

## 9. Testing Strategy

Use TDD for the command and the check runner.

Required coverage:

- healthy repo with manifest, canonical runtime files, valid lock, and passing verifier
- detached repo with no lock but readable canonical history
- missing manifest
- active lock with missing canonical log
- verifier failure path
- missing `brain` CLI reported as warning
- operator output includes plain-language remediation text
- exit code is `0` for warning-only runs and non-zero for failure runs

## 10. Explicit Non-Goals

This slice does not include:

- JSON output mode
- automatic repair actions
- heartbeat / degraded-state semantics
- skill orchestration diagnostics
- consumer-domain-specific checks
- projection/canonical mismatch explanation beyond reachability

## 11. Next Slice After Doctor

Once `doctor` exists, the next Visibility slice should deepen the status/dashboard explanation layer:

- richer canonical vs projection mismatch messaging
- stale vs detached vs active language improvements
- later, heartbeat and degraded-state reporting
