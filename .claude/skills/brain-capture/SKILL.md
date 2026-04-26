---
name: brain-capture
description: Use during work in this trading-playground repo to capture noteworthy moments into the knowledge brain. Decisions and hard rules write immediately with dedup; observations and findings batch as draft artifacts in .brain-drafts/ for later review via /brain-capture.
---

# brain-capture

Project-scoped skill for the trading-playground repo. Adds structure to
how a Claude session contributes to the knowledge brain: tiered inline
capture during the session, plus an explicit sweep at the end.

This skill layers on top of the root `CLAUDE.md` brain protocol. The root
file says *when* to query/write; this file says *how to tier, draft, and
sweep*.

## Sections

The rest of this file is added in subsequent tasks:

- §1 Tier classification
- §2 Inline-immediate protocol
- §3 Inline-batch protocol and draft format
- §4 Sweep protocol
- §5 Inferred-trigger heuristic
- §6 Don't-draft-this rules
- §7 Edge cases

## §1 Tier classification

Every brain-worthy moment falls into one of two tiers. Decide tier
*before* writing anything.

**IMMEDIATE tier — write to brain right now:**

- Explicit decisions: "let's never X", "we've decided X", "X is
  non-negotiable", "going forward X"
- Hard rules — anything carrying confidence ≥ 0.95
- Constraints that would belong in a strategy spec (e.g. "no pyramiding",
  "skip session if VIX > 35")
- Risk-veto contracts and architectural layering rules

**BATCH tier — write a draft artifact for sweep review:**

- Empirical observations from this session ("today's open slippage felt
  closer to 0.4 ticks than 0.25")
- External references shared in conversation (paper quotes, book excerpts)
- Findings from analysis we did together this session
- Anything carrying confidence < 0.95

If unsure: default to BATCH. Drafts can be promoted to immediate writes
during sweep; rushed immediate writes can't be unwound.

## §2 Inline-immediate protocol

When an IMMEDIATE-tier moment is detected:

1. Pick the **most distinctive keyword** from the content. Heuristic:
   highest-information noun. Strategy names (`supertrend`), instruments
   (`mes`), parameters (`atr`), or domain nouns (`slippage`, `drawdown`)
   beat verbs and adjectives. If ambiguous, fall back to the most
   specific tag.
2. Run `brain_query(<keyword>)` (single keyword — multi-word phrases
   miss; see root `CLAUDE.md`).
3. Show the user the proposed write *and* any related existing nodes:

   ```
   Proposed brain_write:
     content: "<exact content>"
     tags: [<tags>]
     source_type: <human | session>
     source_ref: <ref>
     confidence: <>=0.95>

   Existing related nodes (top 3):
     kn-<id1>  conf <c>  "<one-line excerpt>"
     kn-<id2>  ...

   Write new / supersede <id> / skip?
   ```

4. On `write new` → call `brain_write` with the proposed payload.
5. On `supersede <id>` → call `brain_write` with `supersedes: <id>` (or
   the current `brain_write` semantic equivalent — note the original
   node id in the new node's content if no native field exists).
6. On `skip` → drop it. No file written.

**Confidence regression guard.** If the proposed `supersede` lowers
confidence (new < existing), surface it explicitly:
*"This would lower confidence from 0.95 → 0.7. Confirm?"* Don't silently
regress.

## §3 Inline-batch protocol

When a BATCH-tier moment is detected:

1. Compose the draft content as if it were the body of a brain node — one
   atomic fact, written so the exact string can pass to `brain_write`.
2. Pick a slug: 3-5 hyphenated lowercase words capturing the topic
   (e.g. `mes-open-slippage`, `atr-period-comparison`).
3. Build the filename: `<ISO-timestamp>-<slug>.md`. Timestamp format:
   `YYYY-MM-DDTHH-MM-SS` (e.g. `2026-04-25T10-04-12-mes-open-slippage.md`).
   On collision append `-2`, `-3`.
4. Write the file under `.brain-drafts/`. Create the directory if it
   doesn't exist.
5. Mention the draft in **one** line of conversation:
   *"Drafted to brain buffer: `<slug>`."* Do not ask for approval.
   Continue the conversation.

### Draft frontmatter spec

Every draft artifact has YAML frontmatter followed by content:

```yaml
---
tags: [<lowercase-hyphenated>, ...]
source_type: human | session | ingestion
source_ref: <citable-origin-or-session-tag>
confidence: <0.0-1.0>
tier: batch
dedup_check: <true if confidence >= 0.8 else false>
supersedes: null
---
<one atomic fact, plain prose, no headings>
```

**Field rules:**

- `tags` must follow existing patterns. Query the brain with broad terms
  before inventing new tags; reuse over invent.
- `source_type` is `human` if the user told you directly, `session` if
  derived from this conversation's analysis, `ingestion` if extracted
  from a doc/source the user shared in chat.
- `source_ref` is a citable origin string. For session-derived items,
  use `session:<YYYY-MM-DD>_<topic-slug>`. For user-cited papers/docs,
  use the format from the seeded nodes (e.g. `Aronson 2007, Ch.6`).
- `confidence`: 0.95+ for hard rules (but those are immediate-tier, not
  batch); 0.7-0.85 for empirical findings; 0.5-0.7 for observations and
  hypotheses.
- `dedup_check` is set to `true` automatically when `confidence >= 0.8`,
  which gates the dedup query during sweep.
- `supersedes` is `null` at draft time. Sweep populates it if a dedup
  match is chosen.

A working reference artifact lives at `example-draft.md` in this
directory.

## §4 Sweep protocol

Triggered by `/brain-capture` (primary) or the inferred-trigger prompt
(see §5). Steps:

1. **List drafts.** Read `.brain-drafts/`. If empty, print
   *"No drafts to sweep."* and exit.
2. **Parse each draft.** Read the frontmatter and body. If frontmatter
   is unparseable, mark the draft `⚠️ unparseable frontmatter` — show
   it in the table but skip the auto-write step.
3. **Cross-compare drafts (pre-step).** If two or more drafts share a
   distinctive keyword (per §2's heuristic), surface the candidate
   merge before the table renders:

   ```
   Candidate merge: <slug-1> and <slug-2> both reference "<keyword>".
   keep both / merge into one / drop <slug>?
   ```

   Resolve all merge candidates before continuing.
4. **Render the table.**

   ```
   N drafts ready:
     | slug | tags | conf | one-line summary |
     | ...  | ...  | ...  | ...              |
   Walk through them?
   ```

5. **Walk one-at-a-time, in filename order.** For each draft:

   a. If `dedup_check: true` (i.e. `confidence >= 0.8`):
      - Run `brain_query(<distinctive keyword>)`.
      - Show top 3 related existing nodes by recency:

        ```
        Existing related: kn-<id1>, kn-<id2>, kn-<id3>
        ```

      - Offer: `write new / supersede <id> / skip`.
   b. If `dedup_check: false`:
      - Show the artifact content + frontmatter as-is.
      - Offer: `approve / edit / skip`.
   c. **On approve / write new:** call `brain_write` with the draft's
      payload. On success, delete the draft file.
   d. **On supersede `<id>`:** call `brain_write` with the supersedes
      field set to `<id>`. Apply the §2 confidence-regression guard.
      On success, delete the draft file.
   e. **On edit:** open the conversation to inline edits (user can
      revise content/tags/confidence). After edits, return to the
      offer prompt.
   f. **On skip:** leave the file in place. It will reappear in the
      next sweep.
   g. **On reject (explicit):** delete the file without writing.

6. **Final summary.** Print:

   ```
   N written, M skipped, K rejected, J left as drafts.
   ```

**Atomicity note.** `brain_write` and the file deletion are sequential.
If `brain_write` fails (MCP unreachable, etc.), do NOT delete the file;
report the failure and move to the next draft. No silent loss.

**Resume after crash.** If a sweep is interrupted, drafts already
written-and-deleted are committed to brain; remaining files are still
on disk. Re-running `/brain-capture` resumes naturally.

## §5 Inferred-trigger heuristic

The sweep can fire automatically as a safety-net prompt, but only when
ALL of these conditions hold:

1. `.brain-drafts/` is non-empty.
2. The user's most recent message contains a wrap signal:
   - Explicit thanks: *"thanks"*, *"great"*, *"perfect"*, *"awesome"*
   - Explicit close: *"ok done"*, *"good for now"*, *"that's all"*,
     *"we can stop here"*
   - Clear topic-change to something unrelated to the current thread
3. No prior sweep prompt has been issued in this session.

If all three hold, ask exactly once:

> *"Looks like we're wrapping — run brain sweep on N drafts?"*

User responses:

- **yes** → invoke the sweep protocol (§4).
- **later** → suppress further inferred prompts for the rest of the
  session. The user can still trigger the sweep explicitly with
  `/brain-capture`.
- **no** → same as `later`.

One inferred prompt per session, max. Never nag.

## §6 Don't-draft-this rules

A draft must clear the *"would I want to query this in 3 months?"* bar.
The following do NOT trigger draft creation:

- **Speculation and hypotheticals.** *"I wonder what would happen if
  VIX hit 80"* — no fact to capture.
- **Restatements of seeded knowledge.** If the brain already has a node
  with the same content (verify with `brain_query`), do not draft a
  duplicate. Update the existing node only if there's new information.
- **In-progress reasoning.** Mid-analysis thinking is not a finding.
  Wait until the conclusion lands.
- **Conversation polish.** Greetings, acknowledgments, meta-commentary
  about the session itself.
- **One-off questions answered from memory or the codebase.** If a
  user's question is just a lookup, the answer doesn't need to be
  brain-written — it's already discoverable.

When uncertain whether something clears the bar, ask the user:
*"Worth keeping in the brain, or skip?"* Don't unilaterally draft.

## §7 Edge cases

| Situation | Handling |
|---|---|
| Context compaction mid-session | Drafts on disk survive. If running sweep without recalling buffered items, re-list `.brain-drafts/` first; treat the directory as ground truth. |
| Malformed frontmatter in a draft | Show with `⚠️ unparseable frontmatter` flag in the sweep table. User fixes the file directly or rejects. |
| Dedup query returns many matches | Show top 3 by recency. If user wants more, run another query. Never dump >3 unprompted. |
| Proposed supersede lowers confidence | Surface explicitly: *"This would lower confidence from X → Y. Confirm?"* Never silently regress. |
| Two drafts in same session about same fact | Cross-compare pre-step in §4 catches these. Offer keep-both / merge / drop. |
| Crash mid-sweep | Already-written drafts are deleted; remaining files persist. Re-running `/brain-capture` resumes. |
| Hand-authored draft (user drops a file in `.brain-drafts/` directly) | Treated identically. If frontmatter is missing fields, sweep prompts to fill them inline before writing. |
| Brain MCP unreachable | Fail the current draft, leave the file in place, move to next or abort. No silent loss. |
| Slug collision in same second | Append `-2`, `-3` to filename. Never overwrite. |
| Empty `.brain-drafts/` on sweep | Print "no drafts to sweep" and exit cleanly. |
| Inferred-trigger false positive | Honor "later" for the rest of the session; don't re-prompt. |
| User says "stop drafting" mid-session | Suppress all batch drafts for the rest of the session. Immediate-tier still works. Re-enabled next session. |

### Out of scope

- Concurrent Claude sessions touching the same `.brain-drafts/` directory
  — single-user playground; not solved.
- Long-term draft expiry — old drafts sit until manually swept or deleted.
- Programmatic sweep (cron / hook) — explicit user trigger only.
- Migration from any prior buffer format — none exists.
