---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: structured transfer between planning, implementation, and review
permissions-manifest: execution/manifests/handoff-protocol.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# Handoff Protocol

## [P2] Phase Sequence
1. Plan approved
2. Implementation complete
3. Verification complete
4. Review complete

## [P3] Gates
Each phase requires explicit artifact completion.

## [P4] Handoff Artifact Format
Task ID, file list, assumptions, verification evidence, unresolved risks.

## [P5] Failure Behavior
Gate failure blocks phase transition and emits `STATE_TRANSITION` failure detail.

## [P6] Telemetry Contract
Emit transition events at phase entry and exit.

## [P7] Timeout/Retry Policy
Two retries for missing artifacts, then halt.
