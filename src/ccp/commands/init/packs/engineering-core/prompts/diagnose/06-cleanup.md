# Phase 6 of 6 — Cleanup

Stray debug tags are noise pollution and a confidentiality risk. The
`validate-no-stray-debug-tags` validator will grep the repo for the
instrumentation tag you set in phase 4. Any remaining matches will fail.

Cleanup checklist:
  - Remove every `[DEBUG-...]` (or whichever tag you used) log line.
  - Remove any commented-out debug code.
  - Remove any temporary feature flags or debug routes you added.
  - Confirm `grep -r "<your-tag>" .` returns nothing.
  - If you added a regression test in phase 5, confirm it still passes.

Type `done` when cleanup is complete. The validator will run; if it finds a
stray match it will report `file:line` for each.

If you intentionally left a tag in place (e.g., as a permanent named
checkpoint), rename it to something without `[DEBUG-` so it doesn't trip
the validator on future sessions.
