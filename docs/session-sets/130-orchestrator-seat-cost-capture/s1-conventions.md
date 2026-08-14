# Conventions for Set 130 Session 1 verification

Read this before the diff. It states the agreed baseline so Round 1
spends its findings on real defects rather than on things already
settled.

## What this session is

Set 130 Session 1 of 3, **"The reader that refuses to guess."** The set
makes a session's true cost measurable on a Copilot CLI seat, where
`router-metrics.jsonl` faithfully records `$0.0000` for every routed
call because a seat-authenticated call carries no per-call price.

This session ships **only the reader**. It deliberately ships no
writers, no schema change, and no wiring:

- **Session 2** records the join keys (`COPILOT_AGENT_SESSION_ID` at
  registration; the routed child's `sessionId` on each metrics row).
- **Session 3** ships `disposition.cost`, its schema doc, and the
  close-out / Step 10 reporting path.

A finding that this session's reader is not called from anywhere yet, or
that ids must be supplied by hand, is **by design and out of scope** —
those are Sessions 2 and 3 by name in `spec.md`.

## The spec was authored this session, before registration

`spec.md` was a reserved, explicitly-unauthored stub carrying a
two-session sketch. It was authored in full immediately before Session 1
registered, and the decomposition to three sessions is journaled in
`decisions.jsonl` (`goal-over-letter`, AI authority, reversible). So the
spec diff is large and is part of this session's change set. That is
expected, not scope creep.

Two prose figures in that spec were corrected mid-session, from 866.5
credits / $8.67 to **866.4 / $8.66**: the first pair was summed from
per-conversation values already rounded to one decimal, the second is the
exact figure from the tool (`866,405,000,000` nano-AIU). The `$56.10`
total is unchanged. `decisions.jsonl` is append-only and still carries the
superseded figure; that is deliberate — the journal is a record of what
was decided when, not a document to be revised.

## Suite baseline

- `ai_router/tests/test_seat_cost.py` — **22 passed**, the new file.
- Repo-coupled guards that a new module could trip
  (`test_packaging_hygiene.py`, `test_production_imports.py`,
  `test_drift_guard.py`, `test_no_legacy_field_reads.py`) — **64
  passed**.
- The **required portion of the full suite** (pytest, whose `covers`
  includes `ai_router/`) has **not yet run** at the time this evidence
  was assembled. It runs at the session's second-to-last step, after any
  remediation this round produces — that ordering is the repo's test-run
  policy (A1–A4), not an omission.

## Release contract

Nothing is released by this session. No version bump, no changelog
fragment, no PyPI or Marketplace action. The changelog fragment for this
set is authored at the **set-terminal** session (Session 3), which is
this repo's one-fragment-per-set convention.

## One mechanical file in the diff that is not session work

`ai_router/copilot-catalog.lock` was refreshed mid-session and appears in
the change set. It is **not** a deliverable. The first verification
attempt was refused fail-closed — the lock pinned CLI `1.0.79` against a
live `1.0.80` — and `python -m ai_router.copilot_catalog --refresh
--seat-id op-personal --seat-label operator-personal` is the remedy the
refusal itself names. 11/18 models confirmed across three providers, pin
now `1.0.80.`

Incidentally and on-topic: that refresh cost **63.3 credits ($0.63)**
across 12 probe conversations, measured with this session's own tool.
Like every other seat cost in this repo today, nothing recorded it.

## By-design exclusions

- **No VS Code extension surface.** Named as a non-goal in `spec.md`.
  Nothing rendered changes, which is what keeps `requiresUAT: false`
  honest.
- **No Claude Code / Gemini adapter.** They keep no local usage store.
  The gate is the interface; those engines resolve to `unavailable`.
- **`pathAwareCritique` is deliberately absent** (default `none`). Sets
  118 and 128 armed it because they *reduced* verification. This set
  reduces none — it adds a measurement and authorizes no skip.

## The claim most worth attacking

Every failure mode of this reader returns a **plausible number**, not an
exception. So the assertion under test is not "does it compute the right
sum" but **"can it be made to report unmeasured spend as zero."** The
specific inversions to hunt:

1. Any path where `credits` could be `0.0` rather than `None` when the
   measurement failed.
2. Any path where `CostReport.total_credits` returns a number while a
   component is `unknown` / `unavailable` / `schema_unrecognized`.
3. `unavailable` vs `not_applicable` being confusable — the first is
   "real spend, unseen", the second is "cannot exist, legitimately
   zero". Only a caller may declare the second.
4. The SQLite read mode. `immutable=1` silently skips the WAL and
   undercounts a live store (measured: 17,036 vs 17,035 events, 168.0 vs
   156.5 credits at one instant). The falsifier was proved to fire by
   planting that exact defect into the module and observing two tests
   fail, then reverting.

## Severity rubric

Grade by **consequence**: probability the stated failure scenario hits a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit. The unit inference
(`total_nano_aiu` → credits) is corroborated once and is stated as an
assumption in both the module docstring and `seat-cost.md`; a finding
that it *could* change is already answered by the pinned
`schema_version` check unless it names a path that check misses.
