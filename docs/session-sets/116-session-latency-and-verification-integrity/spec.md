# Session Latency and Verification Integrity Spec

> **Purpose:** Sessions have grown ~3x slower and the operator has named it
> critical: *"this must be fixed or developers won't use the tool."* This set
> fixes the measured causes — a test suite that costs 14 minutes when it
> could cost 4, a verification cap that a second code path walks around, and
> a bookkeeping bug that makes the operator's own proposed ordering backfire.
>
> **Created:** 2026-08-10, from measurement, not opinion.
> **Priority:** Run **before** Sets 113 and 115. Every session run ahead of
> this one pays the old tax, including this set's own later sessions — which
> is why Session 1 is the cheapest, largest win and goes first.
> **Session Set:** `docs/session-sets/116-session-latency-and-verification-integrity/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Sequencing.** Set 114 **completed 2026-08-10 at 08:40** (all three
> sessions VERIFIED, `change-log.md` written), so the collision that would
> have blocked Session 3 no longer exists and **all three sessions may run**.
> Session 3 still opens by confirming 114 is complete and by **reading what
> it shipped** — 114 changed `gate_checks.py`, `spec_admission.py` and
> `start_session.py`, and Session 3 edits the first of those.


> **Operator notes are required reading.**
> [`operator-notes.md`](operator-notes.md) carries the operator's
> 2026-08-10 **gate ruling** — the per-gate disposition Session 3
> implements. It is direction; Session 3 still journals the attestation.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # This set ships no UI surface. Arming a UAT gate on router-and-docs work is exactly the reflex this set exists to correct.
requiresE2E: false        # No rendering surface is touched; the Layer 3 suite is INVOKED differently, not changed.
uatStyle: ad-hoc
pathAwareCritique: required   # The one piece of rigor ADDED here. A set that removes verification controls must itself be reviewed by something that retrieves ground truth independently. End-of-set, so it costs once.
```

---

## The measurements this set acts on

Every number below was measured on 2026-08-10 at commit `9277e104`. None is
estimated. The full record is `test-suite-benchmark-DENICI.txt` and
`docs/session-sets/112-remove-lightweight-tier/s1-before-after-numbers.md`.

**Session duration has roughly tripled** (median `startedAt`→`completedAt`):
0.67h for sets 60-69, 0.86h for 70-79, 1.25h for 80-89, 1.36h for 90-99, and
**1.93h for sets 100+**. Wall-clock spans include operator-away time, so the
median is the honest signal and the maxima are not effort.

**The test suite is 3.6x more expensive than it needs to be.** On a quiet
20-core machine: serial **845.76s (14.1 min)**; `-n auto` with `pytest-xdist`
**234.55s (3.91 min)**; **3.61x**, with identical results either way
(3,769 passed / 5 skipped). Collection alone is **2.02s** — 0.25% of serial
runtime.

**The published test timings are wrong by up to 30x.** `CONTRIBUTING.md`
documents Layer 1 at *"~30s"* and Layer 3 at *"~90s for ~10 scenarios"*. The
truth is ~14 min and ~9.6 min median across 33 tests. Every "just run the
tests" judgement in this repo has been made against those figures.

**The framework cannot see its own test cost.** `test-runs.jsonl` records
`suite`, `command`, `outcome` and a free-text `detail`, but **no structured
duration**. Only some Playwright rows happen to mention a time in prose.

**Cost is in the bulk, not in a few slow tests.** The slowest 25 account for
**205.4s of 811.6s (25.3%)**; the longest single test is 55.87s against a
234.55s parallel wall clock, so slow tests do **not** bound the parallel
floor. The remaining 3,744 tests average 0.16s.

**Deleting tests does not buy time.** Set 112 removed 233 tests (−6.1% of
the count) and measured the saving: **3.64s against a 957s suite — 0.4%**.
One flag saved ~610s. That is a ~170:1 difference in payoff, and the flag
deletes nothing.

**The verification cap is bypassed.** `close_backstop.py:554` calls
`_vs.resolve_round(set_dir, session_number, None)` with **no bounds**, while
`verify_session.py:226-228` defines `PHASE_BOUND_DISCOVERY`,
`PHASE_BOUND_REMEDIATION_REVIEW = 2` and `PHASE_BOUND_CLASSIC = 2`. Router
metrics show backstop rounds **5-10** (Set 111 S2), **5-12** (Set 112 S3) and
**5-7** (Set 114 S1) — requiring no `--operator-authorized-round` and absent
from `sN-rounds.jsonl`.

**Recording the final test run stales the verification that just passed.**
`verification_stamp.py` excludes `s*-rounds.jsonl` (L221) and
`checklist-posts.jsonl` (L253) from freshness bookkeeping; **`test-runs.jsonl`
is not excluded.** So "run the full suite last" invalidates the stamped
round and invites another backstop round — the operator's proposed ordering
makes things worse on current code.

**`test_run_fresh` does not govern pytest.** In `run_of_record.py`, `pytest`
and `mocha` are `expensive=False`; only Playwright is `expensive=True`. The
once-per-session-at-close rule therefore never applied to the 14-minute
suite.

**The doctrine's test ordering is self-contradictory.**
`docs/session-constitution.md` Step 5 says expensive suites run *"fully
once, after the last code change"* — but Step 7 (remediation) **is** a code
change, and verification finds something in nearly every session (7 of 8
supplementary rounds produced Majors). The instruction is therefore
unsatisfiable wherever it matters: every remediation invalidates the run,
so the suite runs again. That is how Set 112 S3 reached **15 test runs and
186 minutes — 59% of the session**. The orchestrator was not being
wasteful; it was obeying a rule that cannot be satisfied where it sits.

## Decisions already made — do not reopen

1. **No test-pruning campaign.** Measured at 0.4% payoff. Deleting from the
   cheap end saves nothing; deleting from the expensive end removes the E2E
   and close-path coverage guarding the very machinery Session 2 repairs.
   Test count may fall as a *consequence* of deleting gates in Session 3;
   it is never the goal.
2. **No risk-ordered test execution.** In a blocking loop the orchestrator
   waits for the whole command, so ordering saves zero wall-clock. Superseded
   by making the suite cheap enough that ordering does not matter.
3. **Parallelism before selection.** At 3.91 min, targeted test selection
   (`testmon`, coverage-based impact analysis) buys little and risks shipping
   a regression. Not in this set.
4. **The operator's three-gate model is the target shape** — bounded
   verification, UAT where relevant, one applicable full suite at the end —
   with the corrections Session 3 carries.

## Non-goals

- **No new gates.** A set about removing ceremony that adds ceremony has
  failed.
- **No test deletion.** No gate is deleted by the operator's ruling, so no
  gate's tests go with it either. This set reduces test *runtime*, not test
  count.
- **No test-selection tooling.**
- **No session-splitting.** The operator's constraint is explicit: shorter
  sessions, *not* more of them.

---

## Sessions

### Session 1 of 3: Make the suite cheap, and make its cost visible

Self-funding: it cuts ~10 minutes from every test run in every later
session, including Sessions 2 and 3 of this set.

**Steps:**

1. Register.
2. **Adopt `pytest-xdist`.** Add the dependency, make parallel execution the
   documented default in `CONTRIBUTING.md` and in `run_of_record.py`'s
   recorded pytest command. **Prove parity before adopting**: identical
   passed/skipped counts serial vs parallel, and record both timings. If any
   test proves parallel-unsafe, fix or mark it — do not abandon the change
   for one offender.
3. **Correct every published test timing.** `CONTRIBUTING.md`'s "~30s" and
   "~90s for ~10 scenarios" are wrong by up to 30x; sweep for the same
   figures elsewhere. Cite the measurement and its commit so the next reader
   can re-derive it.
4. **Record `durationSeconds` as a structured field** in `test-runs.jsonl`,
   written by the same helper that records the run. A free-text `detail`
   that sometimes mentions minutes is not a measurement. Add it to
   `verification_stamp.py`'s bookkeeping exclusions **in this session** —
   Session 2 owns the reasoning, but a new writer must not ship un-excluded.
5. Full pytest (parallel) at close after freeze; verify, close.

**Creates:** the xdist adoption + parity evidence, corrected timing docs, structured test durations
**Touches:** `pyproject.toml`, `CONTRIBUTING.md`, `ai_router/run_of_record.py`, `ai_router/verification_stamp.py`
**Ends with:** the full suite costs ~4 minutes instead of ~14, the documented figures are true, and the framework can report what testing costs it.
**Progress keys:** `xdistParity`, `timingDocsCorrected`, `durationRecorded`

---

### Session 2 of 3: Close the two holes in the verification loop

**Steps:**

1. Register.
2. **Put every route under one budget.** `close_backstop.py:554` resolves a
   round with no bounds while `verify_session.py` enforces them. Unify them:
   one cap covering `verify_session` rounds, backstop rounds and the
   discovery fan-out. **Stop on a clean result**; never encode a round
   *quota*.
3. **Refuse deterministically at the cap.** The backstop must not silently
   buy rounds 5-12. At the cap it stops and says what it wants — an operator
   waiver or an adjudication — exactly as `verify_session` already refuses.
4. **Make backstop rounds auditable.** Every round it runs is written to
   `sN-rounds.jsonl` like any other, so the ledger is the true count. Add a
   test that a backstop round past the cap cannot proceed unauthorized, and
   a regression test that recording the final test run does **not** stale a
   passed verification.
5. Full pytest at close after freeze; verify, close.

**Creates:** the unified round budget, deterministic backstop refusal, the ledger fix and its tests
**Touches:** `ai_router/close_backstop.py`, `ai_router/verify_session.py`, `ai_router/verification_stamp.py`, `ai_router/tests/`
**Ends with:** the cap the operator believed existed actually exists, every round is counted where it can be audited, and running tests last no longer re-opens the loop.
**Progress keys:** `unifiedBudget`, `deterministicRefusal`, `roundsAuditable`, `stalenessRegression`

---

### Session 3 of 3: Ten gates to three

**Steps:**

1. Register. **Confirm Set 114 is complete** (it was, 2026-08-10 08:40) and
   read what it shipped before editing `gate_checks.py`.
2. **Operator decision, journaled.** Reducing gates is a verification
   reduction and sits inside the decision-rights hard carve-out; it is never
   self-authorized. **The operator ruled on 2026-08-10 — see
   [`operator-notes.md`](operator-notes.md) for the per-gate disposition.**
   That is direction; this step still records the attestation in
   `decisions.jsonl` at the time of implementation, and confirms the ruling
   still stands before acting on it.
3. **Implement the ruling.** Keep `verification_integrity`,
   `uat_walk_recorded` and `test_run_fresh` as gates. Keep
   `working_tree_clean` and `pushed_to_remote` as **transactional
   preconditions** — they protect the write, not the ceremony. **Delete
   nothing.** **Demote to warn-not-block** `checklist_posted`,
   `activity_log_entry`, `next_orchestrator_present`, `change_log_fresh`
   and `verification_method_vocabulary`: each check still runs and still
   prints, but it cannot refuse a close.

4. **Fix what "a fresh test run" means — and when it happens.** Two halves
   of one bug. **(a)** `test_run_fresh` does not govern pytest: `pytest` and
   `mocha` are `expensive=False` in `run_of_record.py`, which is why a
   session could run 15 suites unremarked. Scope it to the surfaces the
   session actually touched, so a docs-only session never owes Playwright.
   **(b) Move the full-suite run from Step 5 to Step 8** in
   `docs/session-constitution.md`. Step 5 today says expensive suites run
   *"fully once, after the last code change"* — but **Step 7 remediation is
   a code change**, so the instruction is unsatisfiable in any session where
   verification finds anything, which is nearly all of them. Targeted tests
   during the loop; **one applicable full run after remediation, before
   close.** This depends on Session 2's staleness fix and must not ship
   before it.
5. Close: `change-log.md`, the **required** path-aware critique, Step 9
   review; verify, close.

**Creates:** the journaled gate ruling, the reduced gate set, applicable-suite scoping, the Step 5 → Step 8 reordering, `change-log.md`
**Touches:** `ai_router/gate_checks.py`, `ai_router/close_session.py`, `ai_router/run_of_record.py`, `docs/session-constitution.md`, `docs/`
**Ends with:** three gates the operator believes in, plus preconditions that protect the write — and the expensive suite runs once, after the last code change actually happens.
**Progress keys:** `gateRulingJournaled`, `gatesReduced`, `applicableSuites`, `suiteRunsLast`, `changeLog`


---

## End-of-set deliverables

- A ~4-minute full suite, proven equivalent to the 14-minute one.
- Published test timings that match reality, with the measurement cited.
- Structured test durations, so this diagnosis is a query next time rather
  than a forensic exercise.
- One verification budget covering every route, refusing deterministically,
  with every round in the ledger.
- Ten gates reduced to the operator's three plus named preconditions, ruled
  on and journaled.

## Risks this set should expect

- **The irony risk.** This set pays the very tax it removes. Session 1 is
  ordered first precisely so Sessions 2 and 3 are cheaper. If Session 1
  drifts into scope, that compounding is lost.
- **Parallel-unsafe tests.** These tests spawn real CLIs and do real git
  work in temp repos; some may share paths. That failure is a finding, not a
  reason to abandon xdist — fix or serialize the offender.
- **Session 2 edits the machinery that judges Session 2.** Changing the
  round budget while a round budget governs the session is genuinely
  delicate. Expect to re-read the ledger by hand at least once.
- **Deleting a gate is irreversible in practice.** The operator's ruling
  deletes nothing precisely for this reason — `checklist_posted` was revised
  from deletion to demotion once it emerged it had shipped that same
  morning. A demoted check that never surfaces anything is a deletion
  candidate later, **on evidence**. Session 3 must not quietly convert a
  demotion into a deletion because the code reads more cleanly that way.
- **The 20-minute goal is not this set's promise.** This set removes ~10
  minutes of suite time per run and an unbounded loop. Whether a session then
  fits in 20 minutes is a scope question, and it should be re-measured here
  rather than assumed.
