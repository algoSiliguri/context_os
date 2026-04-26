---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: write or refine technical specs with explicit constraints
permissions-manifest: execution/manifests/spec-writing.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# spec-writing

## [S2] Scope
Capture architecture, invariants, interfaces, and open questions.

## [S3] Invocation Condition
Use when user requests design or spec work.

## [S4] Procedure
1. Define purpose and scope.
2. Define invariants and interfaces.
3. Describe lifecycle and failure handling.
4. Document decisions and unresolved items.

## [S5] Output Format
Structured markdown spec.

## [S6] Termination
Ends when spec is complete and internally consistent.

## [S7] Dependencies
None.

## [S8] Required Capabilities
`fs.read`, `fs.write`.

## [S9] Telemetry Hooks
Emit `SKILL_LOAD` and `SKILL_UNLOAD`.
