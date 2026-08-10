# Operator notes — Set 115

Notes captured from the operator outside a session. Sessions read this
file at their start alongside the spec.

---

## 2026-08-10 — Three step-list defects, observed live in the Explorer

The operator screenshotted the Work Explorer's step rows while **Set 116
Session 3 was in flight** and reported: *"`here` is not in the right
place, one of the tasks was out of order, Register isn't closed."*

What the panel showed:

```
Session 3  in flight
  ( )  Register  <- here
  (v)  Operator decision journaled
  (v)  Implement the ruling
  (v)  Fix what a fresh test run
  ( )  Close
  (v)  Round 1 nit dispositions
```

Register was **complete** — it was the first thing the session did, hours
earlier. Close was the only step still outstanding. So every one of the
operator's three observations is correct, and they are **three separate
defects, not one**. Set 115 owns the session node and its checklist; they
belong here.

Recorded by Set 116 S3 at the moment of observation, with root causes
diagnosed from that session's own records rather than left as a
screenshot for a later session to re-derive.

### Defect 1 — a completed step renders as not-done

**Root cause: an unvalidated status vocabulary with a near-miss pair.**
`session_checklist.STATUS_BOXES` maps `complete` and `done` to `[x]`,
`pending` and `not-started` to `[ ]`, `blocked`/`failed` to `[!]`, and
anything else to `UNKNOWN_BOX` (`[?]`). `SessionLog.log_step()` accepts
**any string** for `status` and validates nothing.

Set 116 S3 logged its Register step as `status="completed"` — one letter
off `complete`, and *exactly* the token `disposition.status` uses
elsewhere in the same framework. It fell through to `UNKNOWN_BOX`, which
the tree renders as the open circle above. The session's activity log
carries `Counter({'complete': 15, 'pending': 15, 'completed': 1})`: one
row, one typo, permanently wrong on screen.

This is a **writer-side** bug wearing a renderer's clothes. The fix
candidates, cheapest first:

1. **Validate at the writer.** `log_step` refuses (or normalises) a
   status outside the known vocabulary. Refusing is better than
   normalising — a silent normalisation hides that two names for one
   idea exist.
2. **Accept `completed` as a synonym of `complete`.** One line, but it
   leaves the underlying trap: the next near-miss (`in progress`,
   `done!`, `Complete`) fails the same way.
3. Reconcile the two vocabularies so `disposition.status` and
   `activity-log` status stop disagreeing about the same word. Largest
   change; possibly out of scope for a UX set.

Whatever is chosen, **the TypeScript mirror must move with it** —
`sessionStepModel.ts` and the shared corpus
`ai_router/tests/fixtures/session-step-parity.json` (Set 114 S3). Add a
corpus case with an unknown status token; the parity harness then proves
both languages agree about it.

### Defect 2 — `<- here` lands on the wrong row

`<- here` marked Register, a step finished hours earlier, while Close
was the outstanding one. Two hypotheses, and they are cheap to tell
apart:

- **Coupled to defect 1** — if "here" is placed on the first row that
  does not read as complete, then the `completed` typo makes Register
  look unfinished *and* steals the marker. If so, defect 1's fix cures
  this for free, and the follow-up question is whether that coupling is
  acceptable: a single bad status token silently relocating "you are
  here" is a fragile design even once the token is validated.
- **Independent** — the marker may key on the *plan* rather than the
  logged record, in which case it is its own bug.

**Test it before fixing it.** A parity-corpus case where exactly one row
carries an unknown status will separate the two in one run.

### Defect 3 — an unplanned step renders after a pending planned one

"Round 1 nit dispositions" is a real step that happened **before** Close,
and it renders **after** it. This is Set 114 S2's documented
reconciliation rule working as designed — *the plan owns each row's
position, the logged step owns its content*, and a logged step the plan
did not predict **appends after the plan**. Set 116 S3 logged it as step
45 deliberately, precisely because it was unplanned.

So this is a **design question, not a coding error**, and it should be
decided rather than patched:

> When an unplanned step is complete and a planned step is still
> pending, which order tells the truth?

Both answers are defensible. Appending keeps the plan's shape stable and
readable. Chronological placement matches what the operator watched
happen — and the operator's reaction here is the evidence that appending
reads as a bug to the person looking at it. A middle option: append, but
visually distinguish unplanned rows so their position is obviously not a
claim about sequence.

Whichever wins, **do not quietly reverse Set 114 S2's rule** — it was
chosen on the record to keep the renderer from inventing rows. Journal
the decision.

### Why these three matter more than they look

The spec's own purpose line says the point of this set is to *"make its
checklist tell the truth."* This screenshot is that failure in the wild:
of six rows, one had the wrong glyph, one had the wrong marker, and one
was in the wrong place — while the underlying records were all correct.
The checklist is the first surface an operator reads to answer "where is
this session", and it was wrong about all three of the things it exists
to say.

**One of these is self-inflicted and worth stating plainly**: Set 116 S3
typed the bad status token itself, saw the `[?]` in the CLI output, and
moved on rather than chasing it. That is exactly the class of thing an
Explorer surface should make impossible to ignore — and it is the
argument for fixing defect 1 at the **writer**, where the mistake is
made, rather than at the glyph map, where it is merely displayed.
