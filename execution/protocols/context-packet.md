---
constitution: AGENT_OS_CONSTITUTION
conforms-to-version: v2
authority: none
conflict-resolution: constitution governs
scope: standard context packet for delegated execution
permissions-manifest: execution/manifests/context-packet.permission.json
component-version: 1.0.0
integrity-sha256: pending
---

# Context Packet Protocol

## [P2] Phase Sequence
1. Gather task context
2. Normalize assumptions
3. Emit packet

## [P3] Gates
Packet must include goal, scope, file ownership, and verification commands.

## [P4] Handoff Artifact Format
YAML or markdown packet with stable keys.

## [P5] Failure Behavior
Missing required keys blocks handoff.

## [P6] Telemetry Contract
Emit packet generation start/end events.

## [P7] Timeout/Retry Policy
No retries on malformed packet; regenerate entirely.
