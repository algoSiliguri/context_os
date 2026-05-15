# Phase 3 of 6 — Falsifiable hypothesis

A hypothesis without an "if … then …" clause is a guess. Falsifiability
separates diagnosis from speculation. You should be able to state, in one
sentence, what would prove your hypothesis wrong.

Bad hypothesis: "Probably a cache problem."
Good hypothesis: "If the cache TTL is too short, then setting `TTL=3600` and
running the repro should make the bug disappear."
Better: "If the cache invalidator fires on user logout, then logging out
between requests should make the bug disappear."

State at least one falsifiable hypothesis. Use the form:
  "If X is the cause, then changing Y will make the bug disappear."

Rank by likelihood (1 = most likely). Multiple hypotheses are fine — the
validator only requires that each one contains the "if … then …" clause.
