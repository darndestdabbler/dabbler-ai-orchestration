# Corpus, metrics, and the sequential audit

> **Purpose:** Fourth of five sets implementing the verification pipeline
> v3 plan, and the one that decides whether any of it is worth enforcing.
> Sets 141–143 built machinery; this set measures it against a seeded
> corpus and a live sampling policy, and reports the numbers with their
> denominators attached. The honest outcome of this set may be that the
> pipeline does not earn its cost — recall too low, ceremony too high, or
> CPCF unknowable because seat spend is unpriced. Set 145 acts on
> whatever this set finds, including a decision not to enable anything.
> **Session Set:** `docs/session-sets/144-critique-corpus-and-audit/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Plan of record:** `docs/verification-pipeline-v3-plan.md` (the
> Verification Pipeline Operationalization Plan, 2026-08-19), sections
> 9, 10, and 11.1.
> **Baseline commit:** `8be18fb8` on `master`, plus sets 141–143.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-144-corpus-audit`. **Not** developed on
> `master`.
> **Prerequisite:** sets 141, 142, and 143 complete. A corpus measuring
> machinery that does not yet execute checks measures nothing.

> **Note on rule 6:** operator-authorized exception, as sets 136–143.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## Measuring honestly is most of the work

Every number this set produces carries its denominator and, where it is a
rate, its confidence interval. The specific failure modes to design
against:

- **A recall figure without a denominator** is a claim, not a
  measurement. If the denominator is too small to support the claim,
  the correct output is "too small", not a rounded number.
- **Unpriced spend is not zero spend.** Seat-transport calls remain
  unpriced in router metrics. Join seat conversation IDs to measured
  credit cost before computing CPCF; where the join fails, report CPCF as
  **unknown**. A CPCF computed from a $0.00 seat call is a fiction that
  makes the pipeline look free.
- **Audit-discovered misses count double** in recall reporting, as the
  proposal specifies — and the raw numerator and denominator must be
  shown alongside, so the weighting is visible rather than baked in.
- **A holdout partition that gets looked at is not a holdout.** Reserve
  it in session 1 and do not use it for any calibration decision inside
  this set.

## The audit policy this set implements

Primary strata are **routing-signature buckets**, not individual modules.
Module-specific strata are created only after a miss. Sparse evidence
fragments badly, and per-module strata would fragment it on day one.

- Premium audit starts at **20%** for lite and silent standard outcomes.
- At least one eligible item per active stratum per week.
- Drop to 10% only after ≥30 clean audited items in that stratum **and** a
  one-sided 95% upper confidence bound below a 10% miss rate.
- Drop to 5% only after ≥59 clean audited items and the same bound below
  a 5% miss rate.
- **Never below 5%** during this plan.
- Any audit miss resets that stratum to 20%, promotes the matching
  signature or module, and adds a replayable corpus case.
- A **critical** miss immediately forces deep or human review for the
  matching signature until recovery evidence exists.

## Calibration stays frozen

Do not fit free per-signal weights to a small finding set. The initial
weights and tier boundaries from set 142 remain **frozen through the
first complete sequential-audit cycle**, which ends after this set. This
set implements the sampler and the decay arithmetic; it does not tune
anything, and it does not let CPCF drive routing.

## What this set does NOT do (do not reopen)

- **No enablement.** Nothing becomes default-on here. This set produces
  the evidence set 145 evaluates.
- **No weight tuning, no automatic routing.** There is no CPCF-driven
  routing until priced and unpriced spend have been reconciled and set
  145's criteria pass.
- **No new corpus format for legacy sets.** `scripts/corpus_acceptance.py`
  gains required fields for new cases and stays **additive and tolerant**
  for existing ones. Breaking legacy corpus sets to tidy the schema would
  destroy the only historical evidence available.
- **No metric without a denominator**, and no CPCF from unpriced spend.
- **No new Python module.** This fits `metrics.py`, `seat_cost.py`,
  `selection.py`, and the existing script.

---

## Sessions

### Session 1 of 3: The seeded corpus, the acceptance script, and the holdout

1. Register.
2. Build a versioned seeded corpus of **at least 30 defects**, spread
   across the severity vocabulary and all six defect classes, plus the
   replayable historical defects available from this repository's own
   past sets. Each case declares the tree it applies to, the finding it
   should produce, and the class and severity it should be assigned.
3. Extend `scripts/corpus_acceptance.py` for the new required fields
   while keeping legacy sets additive and tolerant: an existing corpus
   set that predates these fields must still pass, and its absence of
   them must not be reported as a defect.
4. Reserve a holdout partition, record which cases are in it and the rule
   that assigned them, and do not read it for any decision in this set.
   The holdout exists so that set 145 can evaluate a proposed change
   against data the machinery has never seen.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out.

**Creates:** the ≥30-case seeded corpus, the extended acceptance script,
the reserved holdout partition. Est. 3 new Python tests.

### Session 2 of 3: Metrics with denominators, and the priced-spend join

1. Register.
2. Add the metric set to `metrics.py`: CPCF, stratified recall with
   denominators and confidence intervals, blocked rate, canary-failure
   rate, escalation rate, ceremony share, latency, manager yield, and
   triage backlog. A rate without its denominator is not a valid record.
3. Join seat-transport conversation IDs to measured credit cost through
   `seat_cost.py` **before** computing CPCF. Where the join fails or the
   spend is unpriced, report CPCF as `unknown` and say why. Nothing may
   read an unpriced call as free.
4. Record the **10% premium spot-check baseline** on the same corpus and
   the same provider mix, because a CPCF number with nothing to compare
   it to cannot support or refuse enablement. This is the comparator set
   145's gate is written against.
5. Record pre-verification full-suite duration as avoidable ceremony —
   the fourth lever set 142 promised, now that there is a place to put
   the number.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** the metric set with denominators and intervals, the priced-
spend join with an honest `unknown`, the 10% spot-check baseline. Est. 3
new Python tests.

### Session 3 of 3: The sampler, and one end-to-end seeded set

1. Register.
2. Implement the 20% sequential audit sampler over routing-signature
   strata, with the confidence-bound decay to 10% and 5%, the 5% floor,
   the reset-to-20%-on-miss rule, and the immediate deep-or-human
   promotion on a critical miss. It runs in shadow: it selects and
   records, and it changes no route.
3. Run one seeded end-to-end set through the whole pipeline: G0 →
   claims → risk → IR → worker → disposition → the **current** final
   verification ledger. The last hop is the point — the new pipeline
   feeds the existing verdict path rather than replacing it.
4. Assert the ordering on that seeded set, as a property of the record
   rather than of the narration: targeted tests precede verification, and
   the full suite occurs only after the final verified tree and is bound
   to that exact tree digest. A full-suite record bound to any other
   digest is stale evidence.
5. Produce the corpus recall and cost report the set exists for, with
   denominators and confidence intervals, and state plainly where the
   denominator is too small to support a claim.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** the sequential audit sampler with confidence-bound decay,
the seeded end-to-end round trip, the recall and cost report. Est. 2 new
Python tests.

---

## Acceptance criterion for the set

The corpus recall and cost reports are **reproducible**: the same corpus
and the same seed produce the same numbers, and every rate carries its
denominator and confidence interval. Where the denominator is too small
to support a claim, the report says so instead of rounding.

CPCF is computed only from priced observations. A seat call whose credit
cost could not be joined reports `unknown`, and no code path treats it as
zero. The 10% premium spot-check baseline exists on the same corpus and
provider mix, so set 145 has something to compare against.

The seeded end-to-end round trip is green from G0 to the current final
verification ledger, and its record proves the ordering: targeted tests
before verification, the full suite exactly once afterwards, bound to the
final verified tree digest.

The sampler selects at 20%, decays only on the stated evidence, never
drops below 5%, and resets on a miss. It changes no route.

**No policy is default-on.** If this set's numbers do not support
enforcement, that is a result, and it is set 145's input rather than a
problem to be argued away here.

## Test budget

Sets 141–143 leave 14 slots against the 480 ceiling. This set spends at
most **8** (3, 3, 2), leaving 6 for set 145's Python allocation. The
corpus is fixture data, not tests: 30 seeded defects are 30 fixtures and
must not become 30 collected cases. Test the acceptance script's
tolerance of a legacy set, the refusal of a rate without a denominator,
the `unknown` CPCF on an unpriced call, and the sampler's decay and reset
arithmetic — not each corpus case.
