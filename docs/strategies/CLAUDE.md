# Strategy specs — Claude instructions

This folder holds **design**, not data. Empirical numbers (returns, slippage,
win rate) belong in the brain, never in these docs. If a number appears here,
it is wrong-by-construction — flag it.

## Before editing a strategy spec

1. `brain_query("<strategy-name>")` with single distinctive keywords (e.g.
   `"supertrend"`, `"atr"`) — multi-word queries miss; see root CLAUDE.md.
2. Also `brain_query` with `tags=["empirical", "<strategy-name>"]` to surface
   any backtest / parameter-sweep findings that should constrain the edit.
3. If the brain returns a node that contradicts what's about to be written,
   stop and surface the conflict before changing the doc.

## Tag vocabulary (this folder only)

Use these tags when proposing a `brain_write` from work in this folder.
Match existing patterns — don't invent synonyms.

| Topic                          | Required tags                                  |
|--------------------------------|------------------------------------------------|
| Backtest result                | `empirical`, `backtest`, `<instrument>`, `<strategy>` |
| Parameter sweep finding        | `empirical`, `parameter-sweep`, `<param>`, `<strategy>` |
| Live-vs-backtest divergence    | `empirical`, `live`, `divergence`, `<strategy>` |
| New strategy spec (the design) | `strategy`, `spec`, `<instrument>`, `<strategy>` |
| Retired / deprecated strategy  | `strategy`, `retired`, `<strategy>`            |

`<instrument>` is lowercase ticker (`mes`, `mnq`). `<strategy>` is the
hyphenated slug used in the filename (`supertrend`, not `Supertrend v2.2`).

## source_ref format

| Kind                    | Format                                         |
|-------------------------|------------------------------------------------|
| Backtest run            | `backtest:<YYYY-MM-DD>_<strategy>_v<version>`  |
| Parameter sweep         | `research:<topic>_<YYYY-MM>`                   |
| Live trading observation| `live:<YYYY-MM-DD>_<strategy>`                 |
| The design doc itself   | `docs/strategies/<filename>.md`                |

## Confidence floors

- Hard rules in spec (e.g. "no pyramiding"): 0.95+
- Backtest results: 0.8–0.9 (lower if short window or single regime)
- Live observations from a single session: ≤ 0.7

## When NOT to write to the brain

- Restating what's already in the spec doc — the spec is source-of-truth for
  design; only write if you're capturing a *new* empirical finding or decision.
- Numbers from a backtest you haven't actually run in this session — never
  fabricate `source_ref` values.
