---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: isolate and fix failures with reproducible evidence
permissions-manifest: execution/manifests/debugging.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# debugging

## [S2] Scope
Identify root cause and apply smallest correct fix.

## [S3] Invocation Condition
Use when tests fail or runtime behavior is unexpected.

## [S4] Procedure
1. Reproduce failure.
2. Capture failing signal.
3. Narrow suspect area.
4. Implement fix.
5. Re-run reproduction and regression checks.

## [S5] Output Format
Root cause, changed files, verification results.

## [S6] Termination
Ends when failure is reproduced, fixed, and verified.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `fs.write`, `tool.exec`.

## [S9] Telemetry Hooks
Emit `SKILL_LOAD`, `STATE_TRANSITION`, and `SKILL_UNLOAD`.
