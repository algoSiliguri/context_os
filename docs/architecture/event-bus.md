# Event Bus Architecture

## Decision

The trading engine is built around a single in-process event bus. All
decisions flow through the bus as typed events; engines subscribe to event
types they care about.

## Why

- **Traceability.** Every event is also written to the Reality DB, so we can
  reconstruct any session offline.
- **Decoupling.** Strategy doesn't call risk; it emits a `SignalProposed`
  event and the risk engine independently subscribes.
- **Testability.** Engines can be unit-tested by feeding events without
  spinning up the whole stack.

## Event types

```
MarketTick → Strategy
SignalProposed → Risk → SignalApproved | SignalRejected
SignalApproved → Execution → OrderPlaced
OrderPlaced → Broker (sim or live)
Filled → Portfolio → PositionUpdated
SessionEnded → Reality (close)
```

## Boundaries

- The bus runs in-process; no network hops
- All engines run on a single thread (deterministic event ordering)
- Layer 1 (the Brain) is **never** subscribed to bus events during execution
