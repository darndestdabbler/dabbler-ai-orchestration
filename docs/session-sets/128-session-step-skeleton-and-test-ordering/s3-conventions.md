# Conventions for this verification round

## What this session is

Set 128 ("session step skeleton and test ordering") **Session 3 of 3**,
the set-terminal session. Sessions 1 and 2 are closed VERIFIED.

- **Session 1** shipped Component B: the step skeleton and the
  `check_step_shape` check in `ai_router/spec_admission.py`, plus the
  re-baselined session-size cap (`max_steps_per_session` 5 -> 7, derived
  as `CEREMONY_STEPS + WORK_STEP_BUDGET` where the ratified work-step
  budget is N = 3).
- **Session 2** shipped Component A: the ordering rules A1-A4 in
  `docs/session-constitution.md` and
  `docs/planning/session-set-authoring-guide.md`, and mechanized A4 as
  `ai_router/post_round_delta.py`.
- **Session 3 (this one)** re-authors the four *unstarted* specs so the
  blocking check Session 1 shipped refuses none of them.

## The step skeleton, for reading the spec diffs

Every session declares: step 1 `Register`, then N authored work steps,
then a fixed three-step tail -- `Cross-provider verification`,
`Required portion of the full test suite`, `Close-out`. Four ceremony
steps + N work steps. N = 3, so 7 declared steps is the norm.

The malformation being removed from all four specs is the **compressed
tail**: a single step such as *"Full pytest at close after freeze;
verify, close."* that names three stages in one instruction, in the
wrong internal order. That exact shape caused the Set 112 S3 incident
(15 runs / 186 minutes) and the Set 127 S2 repeat.

## By-design exclusions -- please do not report these as defects

1. **This session ships almost no production code, by design.** Its
   declared deliverable is four re-authored specs, one retired planning
   note, and `change-log.md`. The spec's stated irony budget is **2 new
   test functions**; exactly 2 were added. A finding that asks for more
   implementation or more tests is arguing with the spec, not with the
   work.
2. **`spec_admission --all --check` still exits 1**, reporting 49
   sessions over the step cap. Those are all in **started / complete**
   sets and are explicitly out of scope: Set 128's spec states "No
   retrofit of existing specs' step text ... rewriting 40+ historical
   specs is not in scope and would be meaningless -- their sessions are
   closed." The operator ratified that the shape verdict is blocking
   only for **unstarted** sets. **No CI job invokes `spec_admission`**,
   so this exit code breaks nothing. The metric that matters is
   `0 unstarted spec(s) requiring restructuring`, which is now the case.
3. **The four re-authored sets are not executed here.** 113, 118, 121
   and 122 remain `not-started`. This session edits their specs only.
4. **A5 (how "the required portion" resolves per module) is deliberately
   unanswered.** Set 128's spec declares it out of scope; the operator
   assigned it to **Set 129** during Session 2. Reporting A5 as a gap is
   re-litigating a scoping decision.
5. **Set 121 Session 2 declares a `sessionSizeException` at 8 steps.**
   Set 128's own spec predicted no exception would be needed anywhere.
   That prediction was re-measured and is 13/14 true; the one real
   overrun is declared with its reason and journalled to
   `decisions.jsonl`. This is the spec instructing "re-measure rather
   than trust that sentence" working as written, not a miss.

## Suite baseline

- **pytest:** 4,171 collected. Last full run of record (Session 2):
  **4,162 passed / 9 skipped**. No known-failing tests.
- **mocha (Layer 2):** 1,524 passing / 2 pending, fresh from Session 1.
- **Playwright (Layer 3):** 31 passed, fresh from Session 1.
- **This session's targeted run (A1):** `test_spec_admission.py`,
  `test_spec_admission_shape.py`, `test_spec_config.py`,
  `test_decision_journal.py` -- 149 passed, then 37 passed on the shape
  file after the 2 new tests landed.
- Per **A3**, the required portion is carried by `covers`: this session
  touches `ai_router/tests/` and `docs/`, so **pytest is owed**. Mocha
  and Playwright surfaces are untouched and are not owed.

## Release contract

Nothing is published. No version bump and no `ai_router/CHANGELOG.md`
entry: the shipped package's behaviour is unchanged this session (the
only `ai_router/` edit is two test functions). Sessions 1 and 2 already
carry the changelog entries for the code they shipped.

## What to scrutinise hardest

1. **The Set 118 re-authoring is the substantive half.** Does its
   restatement of the retirement rule in terms of A1 / A3 / A4 hold up?
   In particular: the claim that
   `run_of_record.classify_changed_paths` cannot distinguish an edited
   test from a **deleted** one, so a post-suite retirement would
   classify `test-only` and owe no re-verification under A4.1 -- while
   118's own Session 2 rules that retiring a test IS a verification
   reduction. Is that reading of the code correct, and is the ordering
   constraint the right remedy?
2. **The re-read measurements.** The counters were validated by
   reproducing 118's 2026-08-10 row exactly at its own commit
   (`8fda8d85`: 124 files / 3,345 functions / 60,188 test LOC) before
   being run at HEAD. The coupling figure did **not** reproduce
   (43/1,294 under 118's literal prose detector, 48/1,497 under a bare
   `__file__` reading, against a stated 47/1,485). Is that reported
   honestly, and does 118's Step 4 now ask the right question?
3. **The mechanical restructurings** (113, 121, 122) -- did any of them
   silently drop authored content while removing the compressed tail?
   Two sessions had real work inside the ceremony step: 113 S4 (the
   dogfood UAT and "reserve the follow-on sets") and 121 S2 ("argue N
   and the cap from data"). Check both folds are faithful.
4. **The retired planning note.** Every open question in
   `docs/planning/session-step-skeleton-and-verification-cost.md` should
   now carry a RESOLVED/OWNED marker naming what settled it, and stale
   claims of *current* behaviour should be marked (`L-064-8`).
5. **The two new tests.** Are they falsifiable (`L-112-1`)? A mutation
   probe re-planted the compressed tail into 122's spec; the corpus test
   failed naming the offender, and the probe also caught a real bug in
   the test itself (`ShapeFinding.message` does not exist -- the field
   is `problem`), which was fixed before the probe was reverted
   byte-for-byte.
