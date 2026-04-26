# Design: `brain-capture` skill

**Date:** 2026-04-25
**Status:** Approved, pending implementation
**Scope:** A project-scoped skill that gives this repo a structured way to
move knowledge from a Claude session into the brain — both during the
session (for load-bearing items) and at the end of it (for the rest).

## Motivation

Today, brain writes happen ad-hoc. The root `CLAUDE.md` says "when the user
shares a finding, propose a `brain_write`," but there is no protocol for
*how* to capture, *when* to interrupt vs. defer, or *how* to avoid duplicate
nodes accumulating over many sessions. As the brain grows, this gap will
cost us in two ways:

1. **Lost knowledge** — observations made mid-session don't always get
   captured because interrupting the conversation feels expensive.
2. **Duplicate drift** — the same fact gets written 2-3 times across
   sessions because no one queried first.

The `brain-capture` skill formalizes the capture loop so that:

- High-stakes items (decisions, hard rules) are captured immediately, with
  dedup, in a single approve-or-reject moment.
- Lower-stakes items are buffered as on-disk draft artifacts and reviewed
  in batch at the end of the session.
- The brain's growth is observable — drafts on disk are inspectable before
  they become permanent nodes.

## Requirements (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Trigger model | Hybrid: inline triggers during session + end-of-session sweep |
| 2 | Inline behavior | Tiered: decisions/hard-rules immediate, everything else batched |
| 3 | Sweep trigger | Explicit slash command primary, inferred safety-net prompt secondary |
| 4 | Buffer storage | One markdown artifact per draft, in `.brain-drafts/` (gitignored) |
| 5 | Sweep flow | Table summary first, then interactive review one-at-a-time |
| 6 | Dedup discipline | Always `brain_query` first when confidence ≥ 0.8 |

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │  Conversation w/ Claude                 │
                    └────────────────┬────────────────────────┘
                                     │
                                     │ noteworthy item surfaces
                                     ▼
                          ┌──────────────────────┐
                          │  Tier check          │
                          │  (decisions/rules =  │
                          │   immediate; rest =  │
                          │   batch)             │
                          └──────┬──────────┬────┘
                          immediate         batch
                                 │           │
                                 ▼           ▼
                       brain_write     write artifact to
                       (with dedup     .brain-drafts/<ts>-<slug>.md
                        query first)
                                                │
                                                │ later: /brain-sweep fires
                                                ▼
                                  ┌──────────────────────────┐
                                  │  Sweep flow              │
                                  │  1. table summary        │
                                  │  2. interactive review   │
                                  │     - dedup query        │
                                  │       (conf ≥ 0.8)       │
                                  │     - approve/edit/skip  │
                                  │  3. brain_write + delete │
                                  │     artifact on approve  │
                                  └──────────────────────────┘
```

The skill is **procedural instructions** layered on top of existing MCP
tools (`brain_query`, `brain_write`) and existing filesystem tools. It adds
no new code — only structure. It is project-scoped: lives in this repo only,
loads automatically when Claude opens here.

It layers cleanly over the root `CLAUDE.md`:

- Root `CLAUDE.md` answers *when* to query/write
- This skill answers *how to capture in tiers, batch into artifacts, and run
  the sweep*

The two never conflict.

## Components

Three artifacts make up the system.

### 1. `.claude/skills/brain-capture/SKILL.md`

The only file authored as part of this design. Contains:

- Frontmatter: `name`, `description`, `when_to_use` — written so the skill
  triggers on relevant capture moments
- Tier-classification rules (what counts as immediate vs. batch)
- The inline-immediate protocol
- The inline-batch protocol
- The draft frontmatter spec
- The sweep protocol (table → interactive → dedup → write/delete)
- The inferred-trigger heuristic for the safety-net prompt

### 2. `.brain-drafts/`

Gitignored directory. Contains per-artifact markdown files only. Naming:
`<ISO-timestamp>-<slug>.md` (e.g. `2026-04-25T10-04-12-mes-open-slippage.md`).
Sortable by name = sortable by capture time. Timestamp includes seconds; on
collision append `-2`, `-3`.

### 3. Draft artifact format

```yaml
---
tags: [empirical, mes, slippage]
source_type: session     # human | session | ingestion
source_ref: session:2026-04-25_supertrend-discussion
confidence: 0.75
tier: batch              # always 'batch' since immediate ones don't draft
dedup_check: true        # auto-set to true if confidence >= 0.8
supersedes: null         # populated during sweep if dedup query finds match
---
The body is the brain node content — one atomic fact, written to be the
exact string that will pass to brain_write.
```

### What is deliberately NOT a component

- No Python script, no CLI wrapper, no helper module
- No DB-side state — drafts live as files until written or deleted
- No git tracking of drafts — `.brain-drafts/` is in `.gitignore`

### Repo change required

Single line addition to `.gitignore`: `.brain-drafts/`.

## Data flows

### Flow A — Inline IMMEDIATE (decisions, hard rules)

```
Conversation → Claude detects: "this is a decision or hard rule"
            → brain_query with most distinctive keyword
            → Claude shows: "Existing nodes that look related: [N1, N2]"
            → Claude proposes: "brain_write with content X, tags Y,
                                confidence Z. Supersedes N1? Or new node?"
            → User approves/edits/rejects
            → On approve: brain_write fires, conversation continues
```

What counts as a decision or hard rule:
- "Let's never X" / "We've decided X" / "X is non-negotiable"
- New entries that would carry confidence ≥ 0.95
- Anything the spec doc would phrase as a constraint

### Flow B — Inline BATCH (everything else worth keeping)

```
Conversation → Claude detects: "brain-worthy but not load-bearing"
            → Silently write .brain-drafts/<timestamp>-<slug>.md
            → Claude mentions in one line: "drafted to brain buffer (slug: foo)"
            → Conversation continues uninterrupted
```

The brief mention matters — gives the user a chance to say "no don't bother"
without prompting for approval. One-line acknowledgment, not a yes/no
question.

### Flow C — Sweep (`/brain-sweep` or inferred safety prompt)

```
Trigger → ls .brain-drafts/
       → Read all artifacts, parse frontmatter
       → Cross-compare drafts (pre-step): if any two drafts share a
         distinctive keyword, surface as a candidate-merge pair before
         the table renders. User chooses keep-both / merge / drop one.
       → Render table:
           | slug | tags | conf | one-line summary |
       → "N drafts ready. Walk through them?"
       → For each artifact (in order):
           If confidence >= 0.8:
               brain_query(distinctive keyword)
               Show: "Existing related: [...]"
               Offer: write new / supersede X / skip
           Else:
               Show artifact content + frontmatter
               Offer: approve / edit / skip
           On approve  → brain_write → delete file
           On skip     → leave file in place (will appear next sweep)
           On reject   → delete file
       → Final summary: "N written, M skipped, K left as drafts"
```

**"Distinctive keyword" rule.** When the skill needs to pick a keyword for
a `brain_query` (immediate flow, sweep flow, draft cross-compare), prefer
the highest-information noun in the content — usually a strategy name
(`supertrend`), instrument (`mes`), parameter (`atr`), or a domain noun
(`slippage`, `drawdown`). Avoid common verbs and adjectives. If ambiguous,
fall back to the first tag in the frontmatter.

### Inferred-trigger heuristic for the safety-net prompt

Claude prompts *"looks like we're wrapping — run brain sweep on N drafts?"*
when ALL of these are true:

- `.brain-drafts/` is non-empty
- Last user message contains a wrap signal: "thanks", "great", "perfect",
  "ok done", "good for now", or a clear topic-change to something unrelated
- Claude has not already prompted in this session

If the user says "later", Claude does not prompt again in this session. One
nag per session, max.

## Edge cases & failure modes

| Situation | Handling |
|---|---|
| Context compaction mid-session | Drafts on disk survive. Skill instructs Claude to re-read `.brain-drafts/` if running sweep without remembering what's buffered. |
| Malformed frontmatter in a draft | Sweep shows the draft with `⚠️ unparseable frontmatter`. User can fix the file directly and re-run, or reject to delete. |
| Dedup query returns many matches | Show top 3 by recency. If user wants more, run another query. Don't dump 20. |
| Proposed supersedes lowers confidence | Skill rule: never silently regress confidence. If new < existing, flag explicitly: *"This would lower confidence from 0.95 → 0.7. Confirm?"* |
| Two drafts in same session about the same fact | Sweep compares drafts to each other before brain queries. Show as a pair, offer merge. |
| Crash mid-sweep | Drafts already written are deleted as part of the same step. On crash, files for unprocessed drafts remain. Resume on next sweep is automatic. |
| Hand-authored draft | Treated identically. If frontmatter is missing fields, sweep prompts to fill them inline before writing. |
| Brain MCP unreachable | Fail the current draft, leave the file in place, move to next or abort. No silent loss. |
| Slug collision | Timestamp includes seconds; if still colliding, append `-2`, `-3`. |
| Empty `.brain-drafts/` on sweep | Print "no drafts to sweep" and exit. No errors. |
| Inline batch capture for low-value noise | Skill has a *don't draft this* list: speculation, hypotheticals, content that just restates seeded knowledge. Drafts must clear a "would I want to query this in 3 months?" bar. |
| Inferred-trigger false positive | "Later" suppresses for the rest of the session. |

### Out of scope (YAGNI)

- Concurrent Claude sessions touching the same `.brain-drafts/` — single-user
  playground, not worth solving
- Long-term draft expiry — old drafts sit until manually swept or deleted;
  add cleanup later if needed
- Migration of an existing buffer format — there is no existing buffer
- Programmatic sweep (cron / hook) — explicit user trigger only

## Verification (acceptance checks)

The skill is a behavioral contract, not code. After implementation, these
checks confirm it is working:

1. **Skill loads.** `brain-capture` appears in the available skills list when
   Claude opens this repo. `/brain-sweep` invokes it (not "unknown command").
2. **Inline immediate.** *"Let's decide we never pyramid on MES."* should
   trigger a `brain_query("pyramid")`, surface any related node, and propose
   a `brain_write` with confidence ≥ 0.95 — no file written to drafts.
3. **Inline batch.** *"I noticed today's open slippage felt closer to 0.4
   ticks than the 0.25 we have on file."* should produce a file at
   `.brain-drafts/<timestamp>-<slug>.md` with valid frontmatter, and Claude
   should mention the draft in one line.
4. **Sweep with drafts.** `/brain-sweep` with non-empty `.brain-drafts/`
   should render the table summary first, then walk drafts interactively.
   Confidence-≥-0.8 drafts trigger a `brain_query`; <0.8 drafts skip dedup.
   Approved drafts are written to brain and deleted; skipped drafts stay.
5. **Sweep empty.** `/brain-sweep` against empty drafts dir should exit with
   "no drafts to sweep" — no errors.
6. **Inferred trigger.** Buffered drafts + a wrap signal ("thanks, that's
   all for now") should produce one prompt offering the sweep. Saying
   "later" should suppress further prompts that session.
7. **Negative check.** Speculation ("I wonder what would happen if VIX hit
   80") should NOT produce a draft file. The *don't draft this* rule applies.

## Implementation note

This design intentionally specifies behaviors, not code paths inside the
skill. The skill itself will be written as instructions for Claude, with
each behavior above represented as a checklist item or rule. Implementation
is the next step (writing-plans skill).
