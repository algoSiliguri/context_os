# Phase 4 of 6 — Instrument

Tagged debug logs are the cheapest path to clarity in a confusing bug. Every
debug log added during this session must carry a unique short prefix so
cleanup is a grep, not a memory test.

Pick a unique tag. Recommended format: `[DEBUG-<4-hex>]`. Examples:
`[DEBUG-a4f2]`, `[DEBUG-1c3d]`, `[DEBUG-bug42]`.

Why a tag at all? Two reasons:
  - **Cleanup is a grep.** When you fix the bug, you grep the tag and remove
    every match. No "did I leave a `console.log` somewhere?"
  - **Confidentiality.** Stray debug output is a leak risk in shared logs,
    CI artifacts, and recorded sessions. A tag makes them findable.

Type the tag you'll use for this session. The cleanup phase (phase 6) will
grep the repo for it; any remaining matches will fail the validator.
