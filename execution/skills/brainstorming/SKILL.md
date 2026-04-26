---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: problem framing, goals, constraints, and decomposition
permissions-manifest: execution/manifests/brainstorming.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# brainstorming

## [S2] Scope
Produce concrete problem framing and boundaries.

## [S3] Invocation Condition
Use when request scope or requirements are unclear.

## [S4] Procedure
1. Capture objective and non-goals.
2. List constraints and risks.
3. Propose implementation slices.
4. Select smallest safe first slice.

## [S5] Output Format
A short plan with file ownership and verification commands.

## [S6] Termination
Ends when a bounded implementation plan is produced.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `tool.exec` (read-only commands).

## [S9] Telemetry Hooks
Emit `SKILL_LOAD`, then `STATE_TRANSITION` on completion or failure.
