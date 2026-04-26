---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: mandatory pre-completion verification rules
permissions-manifest: execution/manifests/verification-gate.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# Verification Gate

## [P2] Phase Sequence
1. Run targeted tests
2. Run bundle verifier
3. Confirm zero critical failures

## [P3] Gates
All required commands return exit code 0.

## [P4] Handoff Artifact Format
Command list, pass/fail status, key output excerpts.

## [P5] Failure Behavior
Any failed command blocks completion and requires remediation.

## [P6] Telemetry Contract
Emit `STATE_TRANSITION` for pass/fail.

## [P7] Timeout/Retry Policy
One retry for flaky commands, then fail hard.
