# MES Supertrend v2.2

**Status:** Live
**Author:** Strategy team
**Last updated:** 2026-04-12

## Summary

Trend-following strategy on MES (Micro E-mini S&P 500) futures using the
Supertrend indicator with ATR(14) and multiplier=3 on 1-hour bars.

## Entry rules

- Long entry: price closes above Supertrend line and slope of 50-period EMA > 0
- Short entry: price closes below Supertrend line and slope of 50-period EMA < 0
- One position at a time; flip on opposite signal

## Exit rules

- Stop: opposite Supertrend flip (signal reversal)
- Trail: none (Supertrend itself acts as trailing stop)
- Time stop: end of regular trading hours if PnL within ±0.25%

## Risk

- Max 1 contract per signal
- No pyramiding
- Daily loss cap: $300 per session (~1.5% of nominal)
- Hard skip if VIX > 35 at session open (regime filter)

## Parameters

| Parameter | Value | Source |
|---|---|---|
| ATR period | 14 | Validated against 7, 21 (see brain: empirical/atr) |
| Multiplier | 3.0 | Standard; not tuned |
| EMA filter period | 50 | Standard |
| Bar size | 1h | Validated against 30m, 4h |

## Performance

See brain knowledge under `tags: backtest, supertrend` for the latest
backtest summary. **Do not duplicate numbers here** — the brain is the source
of truth for empirical data; this doc is the design.
