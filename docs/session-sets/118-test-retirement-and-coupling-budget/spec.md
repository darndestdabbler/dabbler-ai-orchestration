# Test Retirement and Coupling Budget Spec

> **Purpose:** The test suite grows linearly and nothing in the framework
> ever retires a test. Set 116 proved that *deleting* tests does not buy
> wall clock (0.4% for a 6.1% cut) and correctly refused a pruning
> campaign. This set attacks the other cost — **change amplification and
> permanent guard accrual** — and it fixes the *slope* rather than
> trimming the *level*.
>
> **Created:** 2026-08-10, from measurement, not opinion.
> **Prerequisites:** Set 116 complete. Its Session 3 moves the full-suite
> run to Step 8 and fixes what "a fresh test run" means; this set changes
> which tests exist and must not race that. **Set 128 complete** (added
> 2026-08-12): this spec is authored against the ordering rules as they
> stood before Set 128, and Set 128 Session 3 re-authors it against the
> new ones. Starting 118 first would execute a retirement rule and a
> coupling budget stated in terms of "targeted" and "the required portion
> of the full test suite" that Set 128 redefines. See
> [`docs/planning/session-step-skeleton-and-verification-cost.md`](../../planning/session-step-skeleton-and-verification-cost.md).
> **Session Set:** `docs/session-sets/118-test-retirement-and-coupling-budget/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. The deliverable is which tests exist and why, not what anything renders.
requiresE2E: false        # Layer 3 is not touched. This set operates on the pytest suite only; Playwright worker policy belongs to Set 117.
uatStyle: ad-hoc
pathAwareCritique: required   # A set that deletes verification must itself be reviewed by something that retrieves repo ground truth independently, exactly as Set 116 required. End-of-set, so it costs once.
prerequisites:
  - slug: 116-session-latency-and-verification-integrity
    condition: complete
  - slug: 128-session-step-skeleton-and-test-ordering
    condition: complete
```

---

## The measurements this set acts on

Measured 2026-08-10 against the pushed tree at `8fda8d85`. **Caveat
recorded at the operator's correction:** the operator's working tree
reports **3,829 collected** tests with work not yet pushed, so every
count below is a floor, not a ceiling. The trend is unaffected.

**The suite grows linearly and does not plateau.** Counting `def test_`
across `ai_router/tests` at twenty points in history:

| date | files | test functions |
| :--- | ---: | ---: |
| 2026-05-01 | 34 | 645 |
| 2026-05-26 | 54 | 890 |
| 2026-06-16 | 84 | 1,787 |
| 2026-07-07 | 109 | 2,498 |
| 2026-08-04 | 121 | 3,047 |
| 2026-08-07 | 128 | 3,386 |
| 2026-08-09 | 121 | 3,221 |
| 2026-08-10 | 124 | 3,345 |

That is roughly **+29 test functions per day, sustained for 100 days,
with no sign of saturation**. The one *decrease* in the series
(3,386 → 3,221) is Set 112 removing the Lightweight tier — the only
retirement event in the repo's history, and it happened as a side effect
of deleting a feature, not because anything asked whether the tests were
still earning their place.

Today: **124 files, 3,345 test functions, 60,188 lines**, 108
`parametrize` decorators expanding to the ~3,829 collected.

**But the ratio is flat, and this is the finding that bounds the set's
ambition.** Test LOC divided by production LOC in `ai_router`:

| date | prod LOC | test LOC | ratio |
| :--- | ---: | ---: | ---: |
| 2026-05-01 | 14,116 | 12,846 | 0.91 |
| 2026-05-26 | 19,907 | 20,043 | 1.01 |
| 2026-06-16 | 33,388 | 30,393 | 0.91 |
| 2026-07-10 | 46,062 | 42,461 | 0.92 |
| 2026-08-07 | 54,964 | 52,425 | 0.95 |
| 2026-08-10 | 54,768 | 52,868 | 0.97 |

**The suite is not outrunning the system.** It has tracked production
code between 0.91 and 1.04 for three months. "Growing without bounds" is
true of the absolute count and false of the proportion. Any session that
starts deleting to hit a number is deleting coverage from a system that
is itself still growing.

**Deleting tests does not buy time — this is settled and must not be
re-litigated.** Set 112 measured it directly: **−233 tests (−6.1% of
count) bought 3.64s against a 957s suite — 0.4%.** Cost is in the bulk,
not the count: the slowest 25 tests are 25.3% of serial runtime and the
remaining 3,744 average **0.16s** each. Parallelism already collected the
3.61x that was available.

**What the growth actually costs is coupling.** At a 0.97 LOC ratio,
every line of production change drags about a line of test change.
**47 files carrying 1,485 tests (44% of all test functions) reach into
the real repository tree** — via `Path(__file__)`, `parents[N]` or a
repo-root constant — rather than a `tmp_path` fixture. Those are the
tests that break on a rename, a doc move or a refactor, and they are
where the change-amplification tax is actually paid.

**Guards accrue permanently and nothing expires them.** Named examples
that exist today:

| file | tests | what it guards |
| :--- | ---: | :--- |
| `test_lightweight_resurrection_guard.py` | 43 | that a tier **deleted in Set 112** stays deleted |
| `test_set111_close_gates.py` | 19 | gate behaviour pinned to one historical set |
| `test_step_row_parity.py` | 4 | one rendering invariant |
| `test_print_session_set_status_completed_count.py` | 4 | one number |

Every set adds guards like these. **No set has ever removed one.** That
asymmetry, not the count, is the unbounded thing.

## Decisions already made — do not reopen

1. **No target number of tests.** There is no "right" suite size and this
   set must never adopt one. A count target converts a coverage question
   into an arithmetic exercise, which is how a retirement rule becomes a
   pruning campaign.
2. **No re-measuring whether deletion saves runtime.** It does not: 0.4%,
   measured twice now. A session that proposes deletion *for speed* has
   misread this spec.
3. **No test-selection tooling** (`testmon`, coverage-based impact
   analysis). Ruled out in Set 116 and unchanged here.
4. **No new blocking gate.** Set 116 reduced ten gates to three plus two
   preconditions. A set about unbounded accrual that adds a gate has
   failed on its own terms. Everything this set ships **reports**.

## Non-goals

- **No runtime target.** Suite wall clock belongs to Sets 116 and 117.
- **No Playwright or Layer 3 change.** Set 117 owns worker policy.
- **No rewrite of the 1,485 repo-coupled tests.** This set *measures and
  names* that coupling and sets the rule; converting them to fixtures is
  a later set's work, on evidence, if it is ever worth it.
- **No deletion beyond what the operator attests to in Session 2.**

---

## Sessions

### Session 1 of 3: Make the suite legible to itself

The repo cannot retire what it cannot see. Today, answering "which tests
guard something that no longer exists?" is a forensic exercise; after
this session it is a query.

**Steps:**

1. Register.
2. **Build `python -m ai_router.test_inventory`.** One record per test
   file: test-function count, LOC, the production modules it imports,
   whether it reaches the real repo tree (`Path(__file__)`, `parents[N]`,
   a repo-root constant) or stays inside `tmp_path`, and first-seen and
   last-modified dates from git. Emit JSON plus a human-readable report.
3. **Classify guards.** A guard test asserts that something *stays
   absent* or pins a historical decision. Detect the population, and
   report each guard's **age in sets since the thing it guards was
   removed** — that number is the input Session 2's rule consumes.
4. **Reproduce this spec's numbers from the tool.** The 3,345 / 60,188 /
   1,485 / 47 figures above must fall out of `test_inventory`, not out of
   a one-off shell command. A discrepancy is a finding about the tool,
   not about the spec — chase it before proceeding.
5. Full pytest at close after freeze; verify, close.

**Creates:** `ai_router/test_inventory.py`, its JSON contract, the first inventory snapshot
**Touches:** `ai_router/test_inventory.py`, `ai_router/tests/`, `docs/`
**Ends with:** every test classified by coupling and guard status, and this spec's own numbers re-derivable by command.
**Progress keys:** `inventoryTool`, `guardClassification`, `numbersReproduced`

> **Irony budget.** This session adds tests to a set about test accrual.
> **Cap: 25 new test functions.** If the tool cannot be covered in 25,
> the tool is too big — split it, do not spend the budget.

---

### Session 2 of 3: The retirement rule, ruled and journaled

**Steps:**

1. Register. Confirm Set 116 is complete and **read what its Session 3
   shipped** — it changed `gate_checks.py`, `run_of_record.py` and
   `docs/session-constitution.md`, and this session edits the last of
   those.
2. **Operator decision, journaled — this is the hard carve-out.**
   Retiring tests is a **verification reduction**.
   `decision_journal.py` refuses it under AI authority
   (`VerificationReductionRefused`). Present the Session 1 inventory and
   record the attestation with `authority="human"`,
   `rubric_line="verification-reduction"` and
   `verification_effect="reduces"`, plus a non-empty operator
   attestation. **No retirement is implemented before this record
   exists.**
3. **Ship the guard-expiry convention.** A `guard` pytest marker
   registered in `pytest.ini`, carrying what the guard protects, the set
   that removed it, and a review-after horizon in sets. Applying the
   marker changes no behaviour — it makes the guard's *purpose*
   machine-readable so it can be reviewed instead of inherited.
4. **Report expired guards at the set boundary.** `test_inventory`
   surfaces guards past their horizon as a list with a recommendation.
   **Report only — it never blocks a close**, per this set's fourth
   standing decision.
5. Full pytest at close after freeze; verify, close.

**Creates:** the journaled operator attestation, the `guard` marker convention, the expiry report
**Touches:** `ai_router/test_inventory.py`, `pytest.ini`, `ai_router/decision_journal.py` (caller only), `decisions.jsonl`, `ai_router/tests/`
**Ends with:** a rule that makes guards reviewable and expiry visible, authorised by the only authority that may authorise it.
**Progress keys:** `operatorAttestation`, `guardMarker`, `expiryReport`

---

### Session 3 of 3: The first retirement pass, and the question that keeps the slope down

**Steps:**

1. Register.
2. **Retire exactly what was attested.** Apply Session 2's ruling to the
   named candidates and nothing else. A candidate the operator did not
   attest to stays. **Record what each retirement gives up** — a
   retirement whose loss cannot be stated is not understood well enough
   to make.
3. **Add the retirement question to close.** At Step 8, the session is
   asked what it retired, and "nothing" is a complete and acceptable
   answer. A question, not a gate. This is the mechanism that changes the
   slope: every set already asks what it added, and nothing has ever
   asked what it removed.
4. **Re-measure and write it down.** Test count, test LOC, the
   test/production ratio and suite wall clock, before and after, in
   `before-after-numbers.md`. **State plainly that wall clock barely
   moved** and why that was expected, so the next operator inherits the
   measurement instead of the intuition.
5. Close: `change-log.md`, the **required** path-aware critique, Step 9
   review; verify, close.

**Creates:** the first retirement pass, the Step 8 retirement question, `before-after-numbers.md`, `change-log.md`
**Touches:** `ai_router/tests/`, `docs/session-constitution.md`, `docs/`
**Ends with:** guards retired on evidence and attestation, and a standing question that makes retirement part of every session instead of an event that happens once every hundred sets.
**Progress keys:** `retirementPass`, `retirementQuestion`, `beforeAfterNumbers`, `changeLog`

---

## End-of-set deliverables

- `test_inventory` — coupling and guard status for every test, as a query.
- A journaled operator attestation for the retirement rule, under the
  verification-reduction carve-out.
- The `guard` marker convention and an expiry report that informs without
  blocking.
- One retirement pass, executed only against what was attested.
- Numbers showing the runtime effect is negligible — recorded so the
  question is not asked a fourth time.

## Cross-set dependencies

- **Set 116** — hard prerequisite. Its S3 moves the full-suite run to
  Step 8 and rescopes `test_run_fresh`; this set edits the same
  constitution step.
- **Set 117** — no hard dependency, but it changes how suites *run* while
  this set changes which tests *exist*. If both are open, re-measure this
  set's wall-clock numbers after 117 lands rather than comparing across
  different worker policies.

## Anti-patterns this set must avoid

- **Deleting to hit a number.** There is no target. The 0.91–1.04 ratio
  says the suite is proportionate; the accrual of never-expiring guards
  says the *rule* is missing. Fix the rule.
- **Converting the expiry report into a gate.** Set 116 spent a whole
  session removing seven vetoes. Adding one back here would be the exact
  reflex this repo is trying to break.
- **Self-authorising a retirement.** The carve-out is hard. An
  orchestrator that deletes a test because the inventory recommended it,
  without an attestation, has bypassed the one control that makes the
  rest of this set safe.
- **Ballooning while measuring accrual.** The irony budget in Session 1
  is real and applies to all three sessions.
