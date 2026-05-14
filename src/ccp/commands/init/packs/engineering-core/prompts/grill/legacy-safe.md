# Legacy-safe questions

Supplementary questions for unknown-test-stack repos or large legacy
codebases. These run before the standard functional questions in `/grill`.

## Where would a regression test for this change live?

Reason: if the answer is "nowhere" or "I don't know", we need to either
build a test seam first or fix at a different layer. Don't ship a change
to a codebase that can't catch the next regression.

## What's the blast radius if this change is wrong?

List the downstream components, services, or user flows that touch the
code path you're changing. The answer determines the risk tier and how
much verification effort is warranted.

## Can this be reverted in under 5 minutes?

If yes, document how (git revert this commit / toggle this flag / restart
this service). If no, the change is high-risk regardless of size — small
diffs to load-bearing code are still high-risk if they can't be undone fast.

## What does the existing code call this concept?

If the codebase already has a word for what you're working on, use it. If
the codebase has two competing words, surface the conflict. If you're
introducing a new word, justify why none of the existing ones fit. (This
question feeds the glossary.)

## What's the smallest change that would prove this works?

If your plan is "rewrite this module", what's the 20-line slice that
would demonstrate the approach? Tracer bullets first; full rewrite second.
