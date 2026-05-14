# Phase 5 of 6 — Fix at the correct seam

A fix at the wrong seam is a future bug. The "correct seam" is the layer
where the bug is actually caused — not the layer where it's most visible.

Three options:

  1. **Fix at the seam.** Describe the change: where it lands (file + symbol),
     why this is the right layer, and what tests you added or will add.

  2. **Fix elsewhere, with reason.** Sometimes the right seam is out of reach
     (third-party library, frozen API, scope constraint). Describe the
     workaround AND the technical-debt note for the real fix.

  3. **No correct seam exists.** This is the honest output sometimes. If the
     architecture has no place for this fix, that's the finding. Type
     `no-seam` and describe the architectural gap. This becomes the input to
     a future `/improve-codebase-architecture`-style refactor — don't fake
     a fix just to close the task.

State the option you're choosing and the details for it.
