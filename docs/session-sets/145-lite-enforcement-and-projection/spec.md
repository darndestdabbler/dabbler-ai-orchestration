# Lite enforcement, the probation ratchet, and a minimal projection

> **Purpose:** Last of five sets implementing the verification pipeline
> v3 plan. It enables **only** the portion the measurements from set 144
> support — which may be none of it. Session 1 is a gate, not a feature:
> it evaluates the enablement criteria and either allows explicit `lite`
> enforcement or keeps the whole pipeline in shadow and names the
> remediation or the kill. Sessions 2 and 3 add the two mechanisms that
> keep the thing from growing without bound: probation with expiry for
> prose playbooks, and a projection surface deliberately too small to
> host policy in TypeScript.
> **Session Set:** `docs/session-sets/145-lite-enforcement-and-projection/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Plan of record:** `docs/verification-pipeline-v3-plan.md` (the
> Verification Pipeline Operationalization Plan, 2026-08-19), sections
> 8, 10, 11, and 14.
> **Baseline commit:** `8be18fb8` on `master`, plus sets 141–144.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-145-lite-enforcement`. **Not** developed on
> `master`.
> **Prerequisite:** sets 141–144 complete. Session 1's gate is
> unevaluable without set 144's corpus report and spot-check baseline.

> **Note on rule 6:** operator-authorized exception, as sets 136–144.

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

## The enablement gate (plan §11.1), evaluated in session 1

Every one of these must hold before any enforcement is allowed:

- Full existing Python and extension CI is green.
- The affected-test selector demonstrates that ordinary changes cannot
  pass pre-verification G0 on full-suite evidence, while both
  repository-wide exceptions remain auditable.
- A seeded remediation proves targeted reruns occur before
  re-verification, and the complete suite runs only on the final verified
  tree.
- Schema and corpus acceptance checks are green.
- The seeded end-to-end round trip is green.
- Malformed-artifact acceptance, unauthorized pull, and queue corruption
  counts are **zero**.
- Corpus point recall is **≥0.70 overall and ≥0.90 for critical cases**,
  with denominators and confidence intervals reported. If the denominator
  is too small to support the claim, enforcement stays off.
- CPCF is no worse than the 10% premium spot-check baseline on
  comparable, **priced** observations.
- Ceremony is ≤15%, and median lite latency is ≤10 minutes.
- Blocked checks and canary failures are within their pre-registered
  bounds.

A gate that "almost" passes has not passed. Partial credit here is how a
measured experiment turns into an unmeasured default.

## What stays deferred, and what it would take (plan §11.2)

- **Deep routing default-on** — until corpus recall, provider-role
  feasibility, cost, and one full sequential-audit cycle are stable. Deep
  may exist only as an explicit experiment.
- **Daemon default-on** — until soak runs show zero lost or duplicated
  work, zero queue corruption, zero protocol incompatibility, and zero
  orphan leakage. The daemon's boundary and controls are plan §12; none
  of it is built in this set.
- **Adaptive calibration and CPCF auto-routing** — until at least one
  full stable sequential-audit cycle, reconciled cost data, and holdout
  evaluation. Weights change by at most 1 per monthly review, correlated
  signals move as a documented group, and calibration stays advisory for
  one further stable cycle after that.
- **Richer exemptions** — every class beyond docs-only, until measured
  false-positive reduction outweighs audited miss risk.
- **Manager-role UI** — until disposition semantics are stable in the CLI
  and ledger artifacts.
- **Language-generic sensitive and concurrency analysis** — unless backed
  by a real executable for that language. Model judgment does not
  substitute for a missing perimeter control.

## Kill and rollback (plan §11.3)

- Severity-weighted CPCF worse than the 10% premium baseline for **four
  consecutive comparable weeks** disables the policy and returns to
  baseline.
- Any **critical silent miss** immediately disables the exemption for the
  matching shape and promotes it to deep or human review.
- A schema or ledger integrity failure disables new-policy enforcement;
  current verification remains available.
- **Rollback is a configuration change** from enforcement to shadow or
  off. It must never require deleting or rewriting machine evidence.

## Probation, and why it has an expiry

A prose playbook enters probation only when all of these hold:

1. it came from a confirmed finding in the candidate stream;
2. independent triage confirmed the finding and its defect class;
3. a replay fixture shows current G0 and the standing playbooks **miss**
   it and the candidate check **finds** it;
4. `why_not_executable`, owner, expiry date, carrying cost, and expected
   reuse are all recorded;
5. fewer than three probationary playbooks are active — otherwise
   admission is one-in/one-out by marginal CPCF.

Probation lasts one audit cycle or 30 days, whichever is longer, with a
hard 60-day maximum. Permanent admission requires positive marginal
recall and competitive marginal CPCF on corpus or live audited samples.
**Expiry without that evidence deletes the playbook.** It is not archived
as active guidance, because an archive of expired guidance is how a
review checklist becomes unreadable.

The three standing playbooks are the starting point. Growing 3 → 6
requires corpus evidence; twelve is a hard ceiling. Every quarterly
review tries deterministic compilation first, and an executable
replacement deletes or shrinks the prose **in the same change**.

## What this set does NOT do (do not reopen)

- **No rule implemented twice.** Python decides; TypeScript renders.
  Every projection field is computed in `progress.py` and parsed in the
  extension. A threshold, a severity comparison, or a tier decision in
  TypeScript is a defect, not a convenience.
- **No manager-role UI, and no policy controls in the extension.**
- **No new playbook admitted to demonstrate the probation mechanism.**
  An empty probation list is the correct initial state.
- **No default-on lite in this set.** If the gate passes, `lite`
  enforcement becomes explicitly selectable; making it the default is a
  later release decision with its own operator sign-off.
- **No merge to `master` inside this set.** That is a separate operator
  go/no-go on the complete branch diff, after all §11 gates.

---

## Sessions

### Session 1 of 3: Evaluate the gate, and act on what it says

1. Register.
2. Evaluate every criterion in the enablement gate above against set
   144's reports, recording each as pass or fail with the measurement and
   its denominator beside it. A criterion that cannot be measured is a
   fail, not an omission.
3. **Decision point, and the whole purpose of the session.** If every
   criterion passes, make `lite` enforcement explicitly selectable — a
   configuration value an operator chooses, not a default — and record
   the evidence that permitted it. If any criterion fails, keep shadow
   mode, name the specific remediation, and if the failure is the kill
   criterion, invoke it and stop.
4. Implement rollback as a configuration change: moving from enforcement
   back to shadow or off must require no deletion or rewriting of machine
   evidence. Prove it by doing it, in both directions.
5. Implement the three automatic disablements — four consecutive
   comparable weeks of worse-than-baseline CPCF, a critical silent miss
   for the matching shape, a schema or ledger integrity failure — so they
   are code that fires rather than a policy someone remembers.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** the recorded gate evaluation, `lite` enforcement as an
explicit choice if permitted, the rollback path, the three automatic
disablements. Est. 3 new Python tests.

### Session 2 of 3: The candidate stream, probation, and compile-down

1. Register.
2. Implement the candidate stream: confirmed findings that no standing
   playbook produced flow into it for triage, and nothing enters
   probation without passing through it.
3. Implement probation admission with all five preconditions enforced at
   the writer, including the replay fixture that proves current G0 and
   the standing playbooks miss the case. A playbook admitted without its
   fixture is admitted on an assertion.
4. Implement expiry, and make it **deletion**: one audit cycle or 30
   days, whichever is longer, 60 days hard maximum, and on expiry without
   positive marginal recall and competitive marginal CPCF the playbook is
   removed. Not archived, not marked inactive, not retained for
   reference.
5. Implement the compile-down record: an executable replacement deletes
   or shrinks the prose in the same change, and the record shows which
   prose the executable retired.
6. Admit **no** new playbook. The correct state at the end of this
   session is three standing playbooks and an empty probation list.
7. Cross-provider verification.
8. Affected tests before verification; the full suite once, after.
9. Close-out.

**Creates:** the candidate stream, probation admission with one-in/one-
out, expiry-as-deletion, the compile-down record. Est. 2 new Python
tests.

### Session 3 of 3: A projection small enough to stay honest

1. Register.
2. Add the additive Python projection fields in `progress.py`: tier,
   state, blocked count, and unresolved dispositions. Four fields, each
   computed in Python, each a value rather than a rule.
3. Add the TypeScript parser and tree-descriptor tests only. The
   extension parses what Python decided and renders it. No threshold, no
   severity ordering, no tier logic crosses the language boundary.
4. Prove the one-implementation rule holds for this set's surface: every
   decision the extension displays is traceable to a Python field, and
   removing the Python field removes the display rather than falling back
   to a TypeScript default.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out, the end-of-set `change-log.md`, and the experiment's
   summary: what the measurements showed, what is enabled, what stayed
   deferred, and the recommendation for the `master` merge decision —
   which remains the operator's to make.
8. Prepare, but do not perform, the merge to `master`: the complete
   branch diff, the §11 gate results, and the go/no-go recommendation.
   The merge is a deliberate release change requiring operator approval,
   not the last step of a session.

**Creates:** four additive projection fields, the TypeScript parser and
descriptor tests, the experiment summary and merge recommendation. Est. 1
new Python test and 8 TypeScript tests.

---

## Acceptance criterion for the set

`lite` policy is enforced **only** if the measured evidence supports it,
and is honestly off otherwise, with the failing criterion named. Every
gate criterion has a recorded pass or fail with its measurement and
denominator beside it; an unmeasurable criterion is recorded as a fail.

Rollback from enforcement to shadow or off is a configuration change,
demonstrated in both directions, and it deletes and rewrites no machine
evidence. The three automatic disablements fire from code.

Probation cannot become an unbounded archive: admission requires all five
preconditions including the replay fixture, the active limit is three
with one-in/one-out by marginal CPCF, and expiry deletes. At the end of
this set there are three standing playbooks and **zero** probationary
ones.

The extension renders Python truth. Every displayed value traces to a
Python projection field, and no rule is implemented in both languages.

The suite is within 480 Python and 215 TypeScript tests. No Python module
was added without one being deleted. Deep routing, the daemon, adaptive
calibration, richer exemptions, and the manager-role UI all remain
deferred, each with its gate written down rather than its absence merely
noted.

The merge to `master` is prepared and recommended, not performed.

## Test budget

Sets 141–144 leave 6 Python slots against the 480 ceiling, which is
exactly this set's allocation (3, 2, 1). The TypeScript allocation is
**8** against the 215 ceiling, spent entirely in session 3 on parsing and
tree descriptors — none on rules, because there are none to test on that
side. If session 1's gate fails and the pipeline stays in shadow,
sessions 2 and 3 still run: probation and projection are how the
experiment stays legible whether or not it is enabled.
