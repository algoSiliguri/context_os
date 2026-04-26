---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: test-first implementation for feature and bugfix work
permissions-manifest: execution/manifests/tdd.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# tdd

## [S2] Scope
Drive implementation by failing test, minimal fix, and green verification.

## [S3] Invocation Condition
Use when code behavior changes.

## [S4] Procedure
1. Add a failing test.
2. Run target test and confirm failure.
3. Implement minimal passing change.
4. Run tests and confirm pass.

## [S5] Output Format
Patch summary plus test evidence.

## [S6] Termination
Ends when targeted tests pass.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `fs.write`, `tool.exec`.

## [S9] Telemetry Hooks
Emit `SKILL_LOAD` at start and `SKILL_UNLOAD` at completion.
