---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: code review for bugs, regressions, and missing tests
permissions-manifest: execution/manifests/review.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# review

## [S2] Scope
Evaluate correctness and risk, not style-first feedback.

## [S3] Invocation Condition
Use when user requests review or pre-merge validation.

## [S4] Procedure
1. Inspect changed files.
2. Identify defects by severity.
3. Provide evidence with file references.
4. Note test gaps.

## [S5] Output Format
Findings-first list ordered by severity.

## [S6] Termination
Ends when findings and residual risks are reported.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `tool.exec`.

## [S9] Telemetry Hooks
Emit `SKILL_LOAD`, optional `VIOLATION`, then `SKILL_UNLOAD`.
