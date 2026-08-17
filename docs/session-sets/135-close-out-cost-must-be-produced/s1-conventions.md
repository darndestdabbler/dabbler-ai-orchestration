# Session 1 — verification conventions (read this first)

> G-010: the agreed baseline, stated up front so Round 1 spends its findings on
> real defects rather than on the baseline.

## What this session is

A **read-only audit**. Set 135 Session 1 measures how much of this repo's
recorded cost history is wrong. It ships:

- `cost-audit.json` — machine-readable, one row per session, claimed vs measured
  per component, plus the classification and the roll-up totals.
- `cost-audit.md` — the reading, including what is unrecoverable and why.
- `ai-assignment.md` — the Step 3.5 routed analysis, recorded verbatim.

## By-design exclusions — please do not report these as defects

1. **No production code was changed.** `ai_router/` is untouched by design.
   The gate is Session 2's deliverable; this session is the measurement that
   sizes it. The spec says so explicitly (*"Measure before building"*).
2. **No closed session's record was modified.** The spec's Step 2 says
   *"Read-only: nothing in a closed session's record is edited"*, and the
   Non-goals section forbids rewriting history. Absence of corrections to
   `disposition.json` files is compliance, not omission.
3. **No suite is owed.** `python -m ai_router.run_of_record affected` reports
   *"No declared suite's input set intersects this change (0 paths)"* — the
   entire change set is inside `docs/session-sets/135-.../`. Suites are
   `covers`-by-path, so a suite this session did not touch is not owed (A5).
4. **`pathAwareCritique: none`** is set in the spec with a stated reason
   (G-002). Its absence is not a gap.
5. **The audit scripts live in the session workspace, not the repo.** The set
   declares `Touches: the set directory only`. The method is documented in
   `cost-audit.md` → *Method and reproducibility* so the numbers can be
   re-derived without shipping three throwaway modules into a docs directory.

## The one thing worth attacking

**Are the numbers right, and are the claims about them defensible?**
Specifically:

- The `asserted_false` test requires the session's own `seatSessionIds` to have
  been on record **at the disposition commit itself** (read from that commit's
  `session-state.json`). Is that a sound test of "asserted" rather than "wrong
  in hindsight"?
- The audit walks **all 516 committed versions** of every `disposition.json`,
  not the 135 surviving ones, because Set 113 S8 repaired its own block 90
  seconds after committing it. Is that conclusion (Finding 1) supported?
- Finding 3 claims `routed_seat: measured` at close time is unsound because a
  routed child's turns are still landing. Five sessions are cited as evidence.
  Is the inference right, and is calling it a *labelling* defect rather than a
  *pricing* defect consistent with the spec's Decision 2 (`seat_cost` pricing is
  not under review)?
- Finding 2 claims `routed_api: measured` is unreachable from
  `measure_session`. Verify against `ai_router/seat_cost.py` lines ~919-1008.
- The `$3,305.80 claimed by no session record` figure is scoped by the store's
  own `repository` column. Is the stated caveat sufficient, or does the figure
  still over-claim?

## Severity rubric (G-013)

Grade by **consequence**: probability the stated failure scenario hits a real
user × impact. Low probability **or** low impact is **Minor**. A finding with no
nameable failure scenario is a **nit**, not a Minor.

An audit that reports a wrong *number*, or a conclusion the evidence does not
support, is Critical/Major — those propagate into Session 2's specification.
Prose preferences, heading structure, and table formatting are nits.
