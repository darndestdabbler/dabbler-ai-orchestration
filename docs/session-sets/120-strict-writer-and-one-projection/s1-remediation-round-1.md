# Remediation — Set 120 Session 1, Round 1 (discovery, both lenses)

**Round 1 finding (raised independently by call 1 / spec-conformance and
call 2 / failure-scenario):** `skipped` is accepted by the new writer
vocabulary but the checklist reader still treats it as unknown and
unfinished.

**Verdict: ACCEPTED. Real defect, correctly graded Major, fixed.**

Both lenses found the same thing without seeing each other's output, and
they were right. The session's own deliverable reproduced the defect it
exists to close: `skipped` was drawn from the spec's candidate list on the
strength of appearing once in the measured counts, and I never checked
that a reader could name it. It cannot. `session_checklist.STATUS_BOXES`
has no `skipped` key, so it renders `[?]` — the corrupt-data glyph — and
`_mark_here`'s `terminal = {"complete", "done"}` does not contain it, so a
skipped step is "unfinished" and takes the `<- here` marker away from real
work. That is Set 119 S2's failure with a different token.

## What was wrong with my step 2

The spec said *"draw the legal set from the canonical tokens already in
use … confirm against the counts above; do not invent."* I confirmed
against the counts and stopped there. **Frequency on disk is not the test
for admission to a writer vocabulary — nameability by every reader is.**
A token can be both genuinely used and genuinely unrenderable, and
`skipped` was exactly that: one occurrence, in Set 009 S4, which was an
operator-decided *session* skip logged as a step.

## The fix

**`skipped` is excluded. The legal set is four tokens:** `complete`,
`in-progress`, `pending`, `blocked` — the **intersection** of what was
measured on disk and what the readers understand.

This was escalated to the operator rather than self-decided, and the
ruling is journaled in `decisions.jsonl` (session 1, `escalate-to-human`,
`authority: human`). Three fixes were available and the trade-off was not
mine to settle:

| Option | Why not |
| :--- | :--- |
| Teach both readers (`STATUS_BOXES` + `_mark_here` in Python, `TERMINAL_STATUSES` + `STATUS_GLYPHS` in `sessionStepModel.ts`, plus a parity corpus case) | Correct and complete, and the right long-term answer — but it touches `tools/`, which collides with the operator's in-flight extension edit, and triggers the full Layer 3 obligation this spec waives (`requiresE2E: false`). |
| Teach Python only | Creates a real Python/TypeScript disagreement about which row is current, uncaught by the parity corpus (no case exercises `skipped`). That is the duplicate-parser defect class this repo repeats most (`L-069-1`) — introducing one to fix a rendering bug is a bad trade. |
| Python box only | Kills the `[?]` with zero divergence, but leaves the `<- here` half and would not have met the acceptance criterion. |

`skipped` returns to the vocabulary when both readers can name it —
naturally, with the extension carve, when one computed projection replaces
the duplicated TypeScript derivation.

## Changes

1. **`ai_router/session_log.py`** — `STEP_STATUS_SKIPPED` removed;
   `CANONICAL_STEP_STATUSES` is now four tokens. A new
   `_STEP_STATUS_REFUSAL_REASONS` map gives `skipped` a *reasoned*
   refusal rather than a generic "not in the legal set": the message
   names both readers, explains that it renders `[?]` and steals the
   marker, and directs the caller to record the skip in the step's
   **description**. A caller reaching for `skipped` is not making a typo,
   so a "did you mean…?" hint would have been wrong.
2. **Module docstring** — states that the vocabulary is the intersection
   of measured-and-nameable, and why `skipped` is absent, so the next
   reader does not re-add it from the same count I did.
3. **Docs** — `docs/ai-led-session-workflow.md` and
   `docs/repository-reference.md` updated to four tokens, both carrying
   the `skipped` exclusion and its reason.
   `ai_router/CHANGELOG.md` likewise.

## New tests (3 added, 22 total in the module)

- **`test_every_accepted_token_is_renderable_by_the_reader`** — the
  invariant whose absence caused this. It drives
  `session_checklist.STATUS_BOXES` for every token in
  `CANONICAL_STEP_STATUSES` and fails if any renders as `UNKNOWN_BOX`.
  **Widen the writer without teaching the reader and this test fails** —
  which is the coupling that makes the vocabulary coherent rather than
  merely closed. This is the structural assertion `L-112-1` asks for: it
  holds for a sixth token nobody has proposed yet.
- **`test_a_skipped_step_can_no_longer_reach_disk`** — plants `skipped`
  through the public entrypoint, asserts the refusal explains itself
  (`"deliberately excluded"`, `"DESCRIPTION"`), asserts nothing reached
  disk, and asserts `suggest_step_status("skipped") is None` so it can
  never become a silent normalisation target.
- **`test_a_skipped_step_does_not_take_the_here_marker`** — the second
  half of the acceptance criterion, asserted through the **real
  renderer** (`build_rows`), not by reasoning about `_mark_here`: exactly
  one row is `is_here`, it is the `in-progress` one, and its box is not
  `[?]`.
- `skipped` was also added to the module's `DRIFTED_TOKENS` tuple, so it
  is now planted by the existing refusal, never-reaches-disk, and
  `append_entry` falsifiers as well — 8 additional cases.

## Acceptance criterion

> *Every token accepted by `require_step_status()`, including `"skipped"`,
> is recognized by the checklist reader with a non-UNKNOWN box, and a
> skipped row does not become the active `"<- here"` row when followed by
> pending/in-progress work.*

**Met, by narrowing rather than widening.** Every token
`require_step_status()` accepts is now recognised by the checklist reader
with a non-UNKNOWN box — asserted mechanically, for all four, by
`test_every_accepted_token_is_renderable_by_the_reader`. And a skipped row
cannot become the active row because a skipped row can no longer be
written; `test_a_skipped_step_does_not_take_the_here_marker` proves the
marker lands on the `in-progress` step through the real renderer.

The criterion's phrase *"including `skipped`"* presumes the token stays
legal. It does not, and the criterion's **goal** — no accepted token is
unrenderable — is met more completely this way than by teaching one of two
readers.

**Suite:** `test_step_status_vocabulary.py` — 55 passed.
