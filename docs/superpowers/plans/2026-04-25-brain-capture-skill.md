# brain-capture Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped skill named `brain-capture` that turns a Claude session's noteworthy moments into structured knowledge-brain entries — immediate writes for decisions/hard-rules, draft artifacts for everything else, and an explicit `/brain-sweep` flow with dedup.

**Architecture:** A single `SKILL.md` file at `.claude/skills/brain-capture/SKILL.md` containing all behavioral rules. No code helpers. Drafts live as per-artifact markdown files in `.brain-drafts/` (gitignored). The skill orchestrates `brain_query` and `brain_write` MCP tools that already exist; it adds no new capabilities, only structure.

**Tech Stack:** Claude Code skill format (markdown with YAML frontmatter), existing `knowledge-brain` MCP tools, plain filesystem.

**Spec:** `docs/superpowers/specs/2026-04-25-brain-capture-skill-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `.gitignore` | modify | Add `.brain-drafts/` so draft files are never committed |
| `.claude/skills/brain-capture/SKILL.md` | create | The skill itself — frontmatter + behavioral rules |
| `.claude/skills/brain-capture/example-draft.md` | create | A reference draft artifact illustrating the frontmatter format |
| `.brain-drafts/.gitkeep` | NOT created | Directory is created on first inline-batch capture; no scaffolding |

The whole skill is one document split into seven sections. Each task below adds one section and commits, so any partial state is still a usable (smaller) skill.

---

## Task 1: Scaffold — gitignore, skill directory, minimal SKILL.md

**Files:**
- Modify: `.gitignore`
- Create: `.claude/skills/brain-capture/SKILL.md`

- [ ] **Step 1: Add `.brain-drafts/` to `.gitignore`**

Append the following to `.gitignore` (preserve existing lines):

```
.brain-drafts/
```

- [ ] **Step 2: Verify the line was added**

Run: `grep -n "brain-drafts" .gitignore`
Expected: one line printed showing `.brain-drafts/`.

- [ ] **Step 3: Create the skill directory**

Run: `mkdir -p .claude/skills/brain-capture`
Expected: directory exists, no error.

- [ ] **Step 4: Write minimal `SKILL.md` with frontmatter only**

Create `.claude/skills/brain-capture/SKILL.md` with exactly:

```markdown
---
name: brain-capture
description: Use during work in this trading-playground repo to capture noteworthy moments into the knowledge brain. Decisions and hard rules write immediately with dedup; observations and findings batch as draft artifacts in .brain-drafts/ for later review via /brain-sweep.
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
```

- [ ] **Step 5: Verify the skill loads in Claude**

Open Claude Code in this repo and check `brain-capture` appears in the
available-skills list. (If you can't run Claude in this moment, defer to
the final acceptance check task.)

- [ ] **Step 6: Commit**

```bash
git add .gitignore .claude/skills/brain-capture/SKILL.md
git commit -m "feat: scaffold brain-capture skill with frontmatter

Adds .brain-drafts/ to .gitignore and a minimal SKILL.md that registers
the skill. Behavioral sections will be added in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: §1 Tier classification + §2 Inline-immediate protocol

**Files:**
- Modify: `.claude/skills/brain-capture/SKILL.md`

- [ ] **Step 1: Append §1 Tier classification to SKILL.md**

Append exactly:

```markdown

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
```

- [ ] **Step 2: Append §2 Inline-immediate protocol**

Append exactly:

```markdown

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
```

- [ ] **Step 3: Re-read both sections for coherence**

Read the appended content. Confirm:
- Tier rules in §1 match the spec's "what counts as a decision or hard rule" criteria
- §2's distinctive-keyword heuristic matches the spec's rule
- Confidence-regression guard from spec edge-cases is present

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/brain-capture/SKILL.md
git commit -m "feat(brain-capture): add tier classification + inline-immediate flow

§1 defines IMMEDIATE vs BATCH criteria with default-to-batch tiebreaker.
§2 specifies the dedup query, the proposal/supersede/skip choices, and
the confidence-regression guard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: §3 Inline-batch protocol + draft format

**Files:**
- Modify: `.claude/skills/brain-capture/SKILL.md`
- Create: `.claude/skills/brain-capture/example-draft.md`

- [ ] **Step 1: Append §3 to SKILL.md**

Append exactly:

```markdown

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
```

- [ ] **Step 2: Create the example draft as a reference artifact**

Create `.claude/skills/brain-capture/example-draft.md` with exactly:

```markdown
---
tags: [empirical, mes, slippage]
source_type: session
source_ref: session:2026-04-25_supertrend-discussion
confidence: 0.75
tier: batch
dedup_check: false
supersedes: null
---
MES open slippage measured ~0.4 ticks during 2026-04-25 09:30-09:35 ET
session, vs the 0.25 ticks documented in the 2026-Q1 fill analysis.
Single-session observation; not yet a regime-change claim.
```

- [ ] **Step 3: Verify the example matches the spec format**

Re-read `example-draft.md`. Confirm:
- Frontmatter parses as YAML (no syntax errors)
- All required fields present: tags, source_type, source_ref,
  confidence, tier, dedup_check, supersedes
- `dedup_check` is `false` because confidence is 0.75 (< 0.8) — confirms
  the rule
- Body is one atomic prose statement, no headings

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/brain-capture/SKILL.md .claude/skills/brain-capture/example-draft.md
git commit -m "feat(brain-capture): add inline-batch protocol and draft format

§3 specifies the slug/filename rules, draft frontmatter schema, and
field semantics. example-draft.md is a working reference artifact
showing the format and the dedup_check=false branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: §4 Sweep protocol

**Files:**
- Modify: `.claude/skills/brain-capture/SKILL.md`

- [ ] **Step 1: Append §4 to SKILL.md**

Append exactly:

```markdown

## §4 Sweep protocol

Triggered by `/brain-sweep` (primary) or the inferred-trigger prompt
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
on disk. Re-running `/brain-sweep` resumes naturally.
```

- [ ] **Step 2: Re-read §4 against spec Flow C**

Confirm:
- Cross-compare pre-step is present (matches spec edit + edge-case)
- Confidence-≥-0.8 gate on dedup query
- Approve/skip/reject semantics match spec
- Summary line at end

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/brain-capture/SKILL.md
git commit -m "feat(brain-capture): add sweep protocol

§4 covers list/parse/cross-compare/table/walk/summary, with the
confidence-gated dedup query, approve/edit/skip/reject branches, and
write-then-delete atomicity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: §5 Inferred-trigger heuristic + §6 Don't-draft-this rules

**Files:**
- Modify: `.claude/skills/brain-capture/SKILL.md`

- [ ] **Step 1: Append §5 to SKILL.md**

Append exactly:

```markdown

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
  `/brain-sweep`.
- **no** → same as `later`.

One inferred prompt per session, max. Never nag.
```

- [ ] **Step 2: Append §6 to SKILL.md**

Append exactly:

```markdown

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
```

- [ ] **Step 3: Re-read §5 and §6 against spec**

Confirm:
- §5's three-condition gate matches spec
- "later" suppresses for the rest of the session
- §6 covers the spec's "don't draft this" list and adds the *3-month*
  bar from the spec's edge-cases table

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/brain-capture/SKILL.md
git commit -m "feat(brain-capture): add inferred-trigger heuristic and don't-draft rules

§5 defines the safety-net sweep prompt with three-condition gate and
once-per-session ceiling. §6 lists the don't-draft-this categories
keeping noise out of the buffer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: §7 Edge cases

**Files:**
- Modify: `.claude/skills/brain-capture/SKILL.md`

- [ ] **Step 1: Append §7 to SKILL.md**

Append exactly:

```markdown

## §7 Edge cases

| Situation | Handling |
|---|---|
| Context compaction mid-session | Drafts on disk survive. If running sweep without recalling buffered items, re-list `.brain-drafts/` first; treat the directory as ground truth. |
| Malformed frontmatter in a draft | Show with `⚠️ unparseable frontmatter` flag in the sweep table. User fixes the file directly or rejects. |
| Dedup query returns many matches | Show top 3 by recency. If user wants more, run another query. Never dump >3 unprompted. |
| Proposed supersede lowers confidence | Surface explicitly: *"This would lower confidence from X → Y. Confirm?"* Never silently regress. |
| Two drafts in same session about same fact | Cross-compare pre-step in §4 catches these. Offer keep-both / merge / drop. |
| Crash mid-sweep | Already-written drafts are deleted; remaining files persist. Re-running `/brain-sweep` resumes. |
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
```

- [ ] **Step 2: Verify §7 covers all spec edge cases**

Cross-check against the spec's edge-cases table. Each spec row should
have a matching row in §7 (the table is structurally identical).
Adding a "stop drafting" row is a reasonable extension — surface it as
a note if asked.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/brain-capture/SKILL.md
git commit -m "feat(brain-capture): add edge-cases table

§7 documents handling for compaction, malformed frontmatter, dedup
overflow, confidence regression, draft collisions, MCP failures, hand-
authored drafts, and out-of-scope items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Acceptance verification

**Files:** none modified — this task validates the deliverable.

Walk through the spec's §5 acceptance checks against the completed
`SKILL.md`. For each check, the corresponding behavior must be
explicitly specified in the skill text.

- [ ] **Step 1: Verify check #1 — Skill loads**

Open Claude Code in this repo (or restart the current session).
Confirm `brain-capture` appears in the available-skills list.
Type `/brain-sweep` and confirm Claude invokes the skill (vs. saying
"unknown command").

If Claude doesn't load the skill, double-check the directory is
`.claude/skills/brain-capture/` (case-sensitive on some filesystems)
and that the frontmatter `name:` field matches `brain-capture`.

- [ ] **Step 2: Verify check #2 — Inline immediate**

In a fresh Claude session in this repo, say:
*"Let's decide we never pyramid on MES."*

Expected behavior (per §2): Claude runs `brain_query("pyramid")`,
shows related nodes (if any), and proposes a `brain_write` with
confidence ≥ 0.95. **No file** appears in `.brain-drafts/`.

- [ ] **Step 3: Verify check #3 — Inline batch**

Say:
*"I noticed today's open slippage felt closer to 0.4 ticks than the
0.25 we have on file."*

Expected behavior (per §3): a file appears at
`.brain-drafts/<timestamp>-<slug>.md` with valid frontmatter
(`source_type: session`, `confidence < 0.95`, `dedup_check` matches the
confidence). Claude mentions the draft in one line and continues the
conversation without prompting for approval.

Inspect the file and confirm the frontmatter fields are all present.

- [ ] **Step 4: Verify check #4 — Sweep with drafts**

After a few drafts have accumulated, run `/brain-sweep`.

Expected behavior (per §4):
- Cross-compare pre-step (if any drafts share a keyword)
- Table summary appears first
- Walk drafts interactively
- High-confidence drafts trigger a `brain_query`; low-confidence skip
- Approved drafts: written to brain AND deleted from `.brain-drafts/`
- Skipped drafts: left in place
- Final summary line printed

Confirm by listing `.brain-drafts/` after — only skipped drafts remain.

- [ ] **Step 5: Verify check #5 — Sweep empty**

With `.brain-drafts/` empty (or nonexistent), run `/brain-sweep`.

Expected: *"No drafts to sweep."* No errors. No interactive prompts.

- [ ] **Step 6: Verify check #6 — Inferred safety prompt**

With at least one draft buffered, end a topic with:
*"thanks, that's all for now."*

Expected (per §5): Claude prompts:
*"Looks like we're wrapping — run brain sweep on N drafts?"*

Reply *"later"*. Then end another topic. Confirm Claude does NOT
prompt again that session.

- [ ] **Step 7: Verify check #7 — Negative check**

Say something speculative:
*"hmm I wonder what would happen if VIX hit 80."*

Expected (per §6): NO file appears in `.brain-drafts/`. Speculation
fails the *3-month query bar*.

- [ ] **Step 8: Record verification results**

If any check fails, file the gap as a follow-up task — do not silently
patch the SKILL.md. The plan is the contract.

If all 7 checks pass, the skill is shipped. Record results in this
task's commit message.

- [ ] **Step 9: Commit verification record**

```bash
git commit --allow-empty -m "test(brain-capture): acceptance verification complete

All 7 acceptance checks from spec §5 verified against the implemented
SKILL.md:

  [x] Skill loads, /brain-sweep invokes it
  [x] Inline immediate flow proposes brain_write with dedup
  [x] Inline batch flow writes draft artifact + one-line mention
  [x] Sweep flow: table, walk, dedup gate, write+delete on approve
  [x] Empty sweep exits cleanly
  [x] Inferred trigger fires once, 'later' suppresses re-prompt
  [x] Speculation does not trigger draft

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage check:**
- Spec §Architecture → Task 1 (scaffold)
- Spec §Components → Tasks 1, 3 (gitignore, SKILL.md, example-draft.md)
- Spec Flow A (immediate) → Task 2 §2
- Spec Flow B (batch) → Task 3 §3
- Spec Flow C (sweep) → Task 4 §4
- Spec inferred-trigger heuristic → Task 5 §5
- Spec edge-cases table → Task 6 §7
- Spec out-of-scope items → Task 6 §7
- Spec §5 acceptance checks → Task 7

**Placeholder scan:** No TBD/TODO. Every step has exact content. No
"similar to Task N" — code blocks are repeated where needed.

**Type/name consistency:** `brain-capture` skill name, `/brain-sweep`
command, `.brain-drafts/` directory, ISO timestamp format
`YYYY-MM-DDTHH-MM-SS`, frontmatter field names (`tags`,
`source_type`, `source_ref`, `confidence`, `tier`, `dedup_check`,
`supersedes`) — all consistent across tasks.
