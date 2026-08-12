# Session 1 verification conventions — Set 127, Session 1 of 3

Read this before the change set. It states the agreed baseline so a round
spends its findings on real defects rather than on the things already
settled here (L-064-10).

## What this session was asked to do

Spec: `docs/session-sets/127-the-active-step-shows-in-progress/spec.md`,
**Session 1 of 3: The record can say a step is in flight**.

The framework has no way to say *"this step is running right now"*.
`start_session` seeds plan rows as `pending`; `log_step` writes
`complete` **after** a step finishes. So the `in-progress` token the
renderer has always been able to box was almost never on disk — it is
~1.4% of every step status ever written and appears in no current set —
and neither the CLI checklist nor the Work Explorer can tell *"step 5 has
not been started"* from *"step 5 has been running for forty minutes"*.
That is the operator-reported defect
(`docs/planning/work-explorer-in-progress-step-icon.md`).

Session 1 derives the missing state in the **Python** half only. The
TypeScript mirror, its cross-language parity pin, the tree rendering and
the UAT walk are **Session 2** by the spec's own decomposition.

## Two decisions taken at spec authoring, journalled at registration

Both are in `decisions.jsonl` with their rejected alternatives. They are
settled; a finding that re-opens them is out of scope.

1. **Derive, never write.** Options 1 (log `in_progress` on entering a
   step) and 3 (`start_session` stamps step 1) were rejected: both add a
   writer and an orchestrator convention, neither fixes a historical set,
   and option 3 is wrong from step 2 onward.
2. **Display-only.** The derived state moves no exit code, adds nothing
   to the `log_step` vocabulary, is stored nowhere, and is read by no
   gate.

Three operator rulings on the timestamp are also journalled and are not
re-openable: start time only (no end time), no date handling and no
midnight-crossing special case, and no time at all on a row that has not
started.

## The change set, in one paragraph

`ai_router/session_checklist.py` gains two derived fields on
`ChecklistRow` (`is_active`, `started_at`), an `effective_status`
property the box is now drawn from, `session_flight_facts` (the one read
of `session-state.json` for both "is this session in flight" and its
`startedAt`), and `_active_step_index` / `_derive_progress`.
`_reconcile` now returns `(row, completion)` pairs so the start time can
be derived in the same pass. `session_projection._step_from_row` carries
`isActive` and `startedAt` and reads `state`/`box` from
`effective_status`. `docs/session-progress-schema.md` is updated to
match. Everything else is test work.

## Suite baseline

- Targeted pytest for every suite that touches these modules —
  `test_session_checklist`, `test_plan_seeding`, `test_session_projection`,
  `test_step_row_parity`, `test_checklist_posts`,
  `test_step_status_vocabulary`, `test_gate_checks`,
  `test_close_mandated_writes`, `test_session_log` — **349 passed, 0
  failed, 0 skipped.**
- The **full** pytest suite and any other governed suite are run and
  recorded at close (Step 8), after the last code change, per the
  test-run policy. Their absence from this bundle is the policy, not an
  omission.
- No TypeScript was touched, so no Layer 3 run is owed by this session.
  Session 2 changes an Explorer rendering surface and owes the full
  `npm run test:playwright` (L-064-12).

## Release contract

- No version bump and no `ai_router/CHANGELOG.md` entry this session:
  the spec assigns the changelog to **Session 3**, the set-terminal
  session, along with `change-log.md` and `disposition.json` for the set.
- Nothing is published from this session.

## By-design exclusions — please do not report these as defects

1. **No TypeScript change, and the parity corpus
   (`ai_router/tests/fixtures/session-step-parity.json`) is deliberately
   byte-identical.** The mirror is Session 2.
2. **The two derived fields are not in the corpus's compared field set.**
   They are declared in a new `DERIVED_ROW_FIELDS` tuple beside
   `SHARED_ROW_FIELDS`. This is deliberately *not* the `isHere` shape the
   corpus's guards exist to prevent: `isHere` was **pinned by the corpus
   for one language**, so the fixture asserted a value only half of it
   could produce. These are pinned by neither half, and
   `test_the_derived_fields_are_inert_on_every_corpus_case` **proves**
   they are unobservable through every case (the corpus models no
   `session-state.json` and no entry `dateTime`, so both derive to their
   null answer). That test is also the trigger that closes the window:
   the inputs Session 2 must add to pin the derivation are exactly the
   inputs that make it fail.
3. **`record_post` now reads each row's `box` rather than its raw
   `status`**, so a derived active step appears in `inProgressStepKeys`.
   This is intentional: the record's job is to say what the operator was
   *shown*, and the render it attests draws `[~]` on that row. No gate
   reads the field — `gate_checks.check_checklist_posted` reads only
   `postedAt` — so display-only holds.
4. **The CLI checklist's text shape is unchanged.** The start time is
   derived onto the shared row model so the two languages cannot disagree
   about it, but only the tree will *render* it (Session 2). The
   checklist is a what-is-left list, and widening it is a separate
   question the spec names as a non-goal.
5. **No backfill of the five legacy prose-in-`status` rows.** They
   pre-date Set 120 S1's strict writer. The obligation they create is the
   opposite one, and it is honoured: the derivation does not trust the
   status field blindly.

## Two judgment calls this session made — please DO scrutinise these

1. **One prior test's answer was deliberately reversed.**
   `test_nothing_is_in_flight_when_work_is_caught_up` asserted that a
   session with step 1 complete and nothing logged since has **nothing**
   in flight. That is the operator-reported defect stated as an
   assertion, so it is renamed
   `test_the_step_after_the_last_logged_one_is_where_the_session_is` and
   its docstring argues the reversal.

   The load-bearing claim is that this is **not** the removed `<- here`
   marker returning, and it is worth checking rather than taking on
   trust. The marker pointed at the first non-terminal row of any kind,
   in any session, with no knowledge of whether the session was running —
   which is how it came to point confidently at a step that had finished
   hours earlier when four of Set 119 S2's statuses were unparseable.
   `_active_step_index` differs on four counts, each with its own
   falsifier: (a) only a **seeded plan row** is eligible, so it cannot
   land on a logged step at all; (b) only in a session
   `session-state.json` reports as `in-progress`; (c) it stands down
   **entirely** when any row already boxes `[~]` or `[!]`, so it can
   never show two current rows; (d) eligibility requires a token the
   renderer boxes `[ ]`, so an unrecognised token makes it silent rather
   than confident.

2. **The skipped-step case follows the spec literally.** With plan rows
   1-3 seeded, step 1 and step 3 logged and step 2 never logged, step 2
   is derived active — it is "the lowest-numbered seeded plan-step row
   with nothing logged against it", which is the spec's rule verbatim,
   and the row genuinely is the outstanding one. A frontier rule ("only
   if nothing after it was logged") was considered and rejected: it is
   not what the spec says, it would misfire on any session that logged an
   unplanned step, and it doubles the surface the Session 2 mirror has to
   reproduce. If you believe the literal rule produces a materially wrong
   signal here, say so — that is a real finding, not a nit.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user × impact (L-095-1 / project-guidance). Low probability **or**
low impact is Minor. A finding with no nameable failure scenario is a
nit. The one thing that must not regress, per the spec, is that **exactly
one row per session may be derived in flight, and only while that session
genuinely is** — a derivation that marks a step in a closed session, or
marks several at once, replaces "no signal" with "a wrong signal", which
is strictly worse. Findings in that direction are Critical/Major by
construction.

---

## Round 2 addendum — what changed since round 1

Round 1 returned **VERIFIED on both discovery lenses, 0 blocking
findings**, with two nits from the spec-conformance lens. Both were
accepted and fixed, which is a code change, so this round exists to
re-stamp the current diff rather than because anything was disputed.

1. **`session_flight_facts` ignored the plan-less carve-out.** A set
   whose plan is not yet committed writes a v4 file with **no**
   `sessions[]` ledger and a top-level `status` / `startedAt` instead
   (`docs/session-state-schema.md` → *Plan-less carve-out*); the reader
   shim normalises the missing array to `[]`. Read strictly per-session,
   that file answered "no start time" for every row, so the first row of
   such a set lost a start the file records explicitly. Fixed narrowly:
   with no per-session ledger the carve-out contributes its `startedAt`
   and **never** an in-flight claim, because the file names no session
   number to attach a *current step* to — and nothing is lost by that
   refusal, since a plan-less set has no spec headings and therefore no
   seeded plan rows to derive onto. Measured before fixing: zero such
   files exist in this repo today, but the shape is documented, supported,
   and reachable in a consumer repo, which is why it was fixed rather
   than dismissed.
2. **Bookkeeping records were being treated as steps by the start-time
   chain.** A `path_aware_critique` / `contract_gate` /
   `dual_surface_mode` / `suggestion_disposition` entry carries a
   `dateTime` and renders as a row, but it is a record *about* the
   session written by machinery — which is already why it may not claim a
   planned row. It was both receiving a start of its own and acting as
   the previous step's completion for the row below it. Fixed by making
   the rule say what the spec says — **the previous *step*'s
   completion** — so a bookkeeping row is transparent to the chain
   (`_RowEvidence.is_step_row`) and carries no time itself. Note the
   deliberate asymmetry: an unclaimed *planned* row is a step that never
   finished, so it still BREAKS the chain and the row after it starts at
   an unknown time rather than borrowing a timestamp from further up.

Both fixes ship with their own falsifiers
(`test_a_plan_less_state_file_still_dates_the_first_row`,
`test_a_bookkeeping_record_is_not_a_step_that_started_or_finished`).
Targeted suite baseline is now **351 passed, 0 failed, 0 skipped** across
the same nine suites. Everything else in this document stands unchanged.
