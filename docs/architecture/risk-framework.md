# Risk Framework

## Principle

**Risk vetoes are final.** If the risk engine rejects a signal, the order
never reaches execution. There is no override path in code. Adjusting a risk
rule requires a config change and an engine restart — i.e., a human in the
loop, not a runtime bypass.

## Active rules (engine-enforced)

| Rule | Threshold | Source |
|---|---|---|
| Max position size | 1 contract per signal | `config/risk_rules.yaml` |
| Daily drawdown | -1.5% of session nominal | `config/risk_rules.yaml` |
| Max concurrent positions | 1 | `config/risk_rules.yaml` |
| VIX regime filter | skip if VIX > 35 | per-strategy config |

## Why no overrides

A live risk override during a session is an out-of-band code path. Out-of-
band code paths are how systems lose money in ways no one can reconstruct.
Treat the risk engine as a kill switch, not a negotiation table.
