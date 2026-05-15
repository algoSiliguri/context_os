# Phase 1 of 6 — Build a feedback loop

The feedback loop is the single most important thing in diagnosis. Without a
reproducible signal, every change is a guess. A 30-second feedback loop turns
8 hours of debugging into 30 minutes.

Pick a mechanism, ranked best → last resort:

  1. Failing test — fastest, most precise. Use this if a test seam exists.
  2. `curl` or HTTP probe — for API bugs.
  3. CLI snapshot — record args/env, replay later.
  4. Playwright / headless browser — for UI bugs.
  5. Trace replay — for distributed-system or async bugs.
  6. Throwaway test harness — when no existing seam fits.
  7. Fuzz / property test — for input-shape bugs.
  8. Bisect harness — for regressions.
  9. HITL bash script — user clicks the button each time; last resort.

Type the mechanism you'll use. If none work for this bug, type `none` and
describe what's blocking. That blocker is itself the finding — record it
honestly rather than fake a loop.
