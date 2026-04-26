---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: translate specs into executable implementation plans
permissions-manifest: execution/manifests/planning.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# planning

## [S2] Scope
Produce actionable file-level tasks with verification steps.

## [S3] Invocation Condition
Use when given a design spec or requirements.

## [S4] Procedure
1. Map files and responsibilities.
2. Break into ordered tasks.
3. Add commands and expected results.
4. Add acceptance criteria.

## [S5] Output Format
Markdown plan with checkbox steps.

## [S6] Termination
Ends when plan is saved and reviewable.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `fs.write`, `tool.exec`.

## [S9] Telemetry Hooks
Emit `SKILL_LOAD` and `SKILL_UNLOAD`.
