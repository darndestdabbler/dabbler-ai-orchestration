# Session 1 — Attributing the 2.3×

> **Verdict up front: the 2.3× does not survive re-derivation.** Session
> length really has grown, and the growth reproduces cleanly. Its attribution
> to *"each ceremony step costs 2.3× what it did"* does not. The ratio moves
> between **1.01× and 2.96×** depending on method choices that are all
> defensible, the cohort split date is **exactly** the date the measuring
> instruments were installed, and the flat-work control the claim rests on
> does not hold. What *is* attributable — without depending on the step-key
> taxonomy at all — is **17.9 minutes per verification round** and
> **18.6 minutes per session of recorded suite runtime**.

## Method

Four read-only instruments over committed artifacts. **No new module, no new
instrumentation, nothing written to the repo** — matching the existence proof
the spec cites.

**Committed sources — every operative number below rests only on these:**
`session-state.json` (session boundaries), `activity-log.json` (step
completions), `sN-rounds.jsonl` (verification rounds), `test-runs.jsonl`
(suite runtime).

> **Machine-local source, deliberately quarantined.**
> `ai_router/router-metrics.jsonl` (routed-call latency) is **gitignored and
> untracked** — it is one seat's runtime state and a fresh checkout cannot
> reproduce it. The spec requires analysis over *committed* artifacts, so
> **nothing derived from it is operative**: no corrected value the rest of the
> set inherits, and no candidate's measured minutes, depends on it. The two
> places it appears (§1 and C1) are labelled **non-operative corroboration**
> and are stated in a form that can be deleted without changing any
> conclusion. Where a claim would otherwise need it, the committed
> `sN-rounds.jsonl` figure is used instead.

Stated explicitly, as the spec requires:

- **Outlier rule:** sessions with a wall-clock duration **> 240 min** are
  excluded as away-dominated. 29 of 255 excluded.
- **Idle cap:** each per-step interval is capped at **45 min**. Sensitivity to
  30 / 45 / 90 min is reported rather than assumed.
- **Attribution rule:** the interval *before* a completion belongs to the step
  that completed; the first interval runs from `startedAt`.
- **Cohort split:** 2026-08-07, as in the original analysis.
- **All central tendencies are medians** unless labelled otherwise.

**Corpus:** 255 completed schema-v4 sessions with usable timestamps,
2026-05-26 → 2026-08-16 (82 days). The original analysis had 245 over 81 days;
the corpus has grown by 10 sessions since 2026-08-15. Every difference below
that is explained by those 10 sessions is called out as such.

---

## 1. What reproduces

**Session length grows, and the growth is robust.** This is the one headline
that survives untouched.

| fit | original (n=219) | re-derived (n=226) | verdict |
| :--- | ---: | ---: | :--- |
| trimmed OLS slope | +0.947 min/day | **+0.966 min/day** | reproduces |
| trimmed OLS R² | 0.307 | **0.321** | reproduces |
| trimmed Theil–Sen | +0.901 min/day | **+0.909 min/day** | reproduces |
| excluded as away-dominated | 26 of 245 | **29 of 255** | reproduces |

Over the 82-day corpus that is **+79.2 minutes** (original: +77 over 81 days).
Untrimmed the slope is +2.052 min/day at R² 0.095, which is why the trim
exists and why the trimmed figure is the one to quote.

**"The lever is rounds, not models" reproduces on committed evidence.** A
verification round costs **+17.9 min of loop span** (§4 C1), derived entirely
from `sN-rounds.jsonl` and `session-state.json`. Whatever the model-latency
share turns out to be, it cannot exceed the round cost, so removing a round
dominates any per-call speed-up. *(A machine-local corroboration of the size
of that gap is noted as non-operative in C1.)*

---

## 2. What does not reproduce

### 2.1 The 2.3× is not a stable number

Re-running the identical attribution under six defensible method choices:

| method | pre-cap min/ceremony step | post-cap | **ratio** |
| :--- | ---: | ---: | ---: |
| broad classifier, no burst collapse | 5.46 | 14.44 | **2.65×** |
| **the spec's own four canonical keys** | 7.88 | 8.00 | **1.01×** |
| broad, collapse bursts ≤ 10s | 8.79 | 15.00 | **1.71×** |
| broad, collapse bursts ≤ 60s | 8.79 | 15.00 | **1.71×** |
| broad, idle cap 30 min | 5.46 | 11.88 | **2.18×** |
| broad, idle cap 90 min | 5.46 | 16.13 | **2.96×** |

The published 2.3× sits inside this range but is not distinguishable from any
other point in it. **A number that moves from 1.01 to 2.96 on method choice is
not evidence a reduction pass can act on.**

The second row deserves emphasis: under the spec's *own* named breakdown —
`register`, `cross-provider-verification`, `required-portion-of-the-full-test`,
`close-out` — ceremony cost per step is **flat** (7.88 → 8.00) and it is
*work* that rises (5.89 → 10.56).

### 2.2 The breakdown the spec asks for cannot be produced

Step 2 asks for the ceremony total "broken down **by step key**". It cannot be,
and this is the most consequential finding of the session:

- The corpus holds **1,427 distinct completed step keys**.
- The four canonical keys appear on a *minority* of sessions:
  `register` 91, `cross-provider-verification` 30,
  `required-portion-of-the-full-test` 27, `close-out` 9 — out of 255.
- The median count of canonical-ceremony steps in a **pre-cap** session is
  **0.0**.

`stepKey` is an open vocabulary. Every "by step key" figure therefore depends
on a classifier someone chose after the fact, and the choice of classifier is
worth more than a factor of two (§2.1). This is the same closed-vocabulary
drift Set 120 S1 fixed for step *status* — in a third field.

### 2.3 The instrumentation explanation was dismissed on the wrong control

The spec rules out instrumentation because it "predicts a rise in the ceremony
step *count*, and the count is identical at 3.0." That control tests the wrong
thing. The artifact is not in the count, it is in **timestamp dispersion**:

| cohort | sessions | intervals | **< 1 s** | < 10 s | < 60 s | median |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| pre-cap | 187 | 1,427 | **44%** | 44% | 46% | 145 s |
| post-cap | 68 | 451 | **34%** | 34% | 37% | 295 s |

Nearly **half** of all pre-cap step completions were logged in the *same
second* as the previous one. When several steps are logged in one burst, the
first absorbs the whole elapsed interval and the rest are charged ~0 — which
mechanically deflates pre-cap min/step while leaving the count untouched.
Collapsing bursts at ≤10 s moves the ratio from **2.65× to 1.71×**.

So the count control is satisfied *and* the instrumentation explanation
survives. They were never mutually exclusive.

### 2.4 The flat-work control does not hold

The claim that "work costs what it always did" is the load-bearing control for
the whole argument. It does not reproduce:

| classifier | pre-cap min/work step | post-cap | change |
| :--- | ---: | ---: | ---: |
| broad | 5.96 | 7.68 | **+29%** |
| canonical four | 5.89 | 10.56 | **+79%** |

Work per step rose in every variant tested. A control that moves with the
treatment is not a control.

### 2.5 Three phase figures are smaller than published

| phase | published | re-derived (n=69) |
| :--- | ---: | ---: |
| verification loop (first round → last) | 41.7 min | **35.8 min** |
| Step 8 tail (last round → close) | 17.9 min | **12.6 min** |
| — of which recorded suite runtime | ~15 min | **8.1 min** |
| close execution | 0.2 min | confirmed, not a cost |

### 2.6 The calendar trend does not survive into the measurable window

| population | n | slope | R² |
| :--- | ---: | ---: | ---: |
| all trimmed sessions (May → Aug) | 226 | +0.966 min/day | 0.320 |
| **sessions with a round ledger (Aug 7 →)** | 57 | **+0.122 min/day** | **0.000** |

The +0.97 min/day is a **May-to-August baseline effect**, not evidence of
ongoing drift. Inside the only window where the framework can observe itself
in detail, sessions are not getting longer with the calendar — they get longer
with **round count** (§4).

---

## 3. Dating the rises against what landed

The spec names Sets 111, 116, 119, 127, 128 as candidates. Confirmed and
refuted, from first-row timestamps in the artifacts themselves:

| date (first observed) | what landed | what it did to the measurement |
| :--- | :--- | :--- |
| **2026-08-07 03:16** | **Set 111** — bounds enforcement writes `sN-rounds.jsonl` | created the round ledger |
| **2026-08-07 15:40** | **Set 111 S4** — `run_of_record` + `test_run_fresh` gate writes `test-runs.jsonl` | created the suite-runtime ledger |
| 2026-08-06 → 08-08 | Set 111 also shipped `session_checklist`, `decision_journal`, `disposition.uat` + `uat_walk_recorded`, `spec_admission` | four further recorded obligations |
| **2026-08-10** | **Set 116** — `durationSeconds` made **required** at the writer; pytest-xdist default; close backstop brought under the bounds | made runtime *visible*; also made the suite ~3.6× **cheaper** |
| **2026-08-10 03:39** | seeded `plan-step` rows first appear (**Set 114**, not Set 128) | `register` coverage 40% → 98% |
| 2026-08-10 → 08-11 | Set 119 — `close_preflight`, doc-only cap | one further pre-close stage |
| 2026-08-12 | Set 127 — `verify_session` posts round transitions | more logged rows |

**The finding this table exists to deliver:** the cohort split of 2026-08-07 is
**Set 111's landing date**, and Set 111 is the set that built *every instrument
the post-cap cohort is measured with*. The pre-cap cohort was not measured
worse — for the round ledger and the suite-runtime ledger it was **not measured
at all**. Comparing per-step minutes across that boundary compares an
instrumented regime with an uninstrumented one.

Two corrections to the candidate list:

- **Set 128 is not the origin of the step skeleton.** Seeded `plan-step` rows
  first appear in **Set 114 on 2026-08-10**, two days before Set 128 ran.
- **Set 116 is a cost *reduction*, not a cause.** It cut the suite ~3.6× and
  corrected published timings that were wrong by up to 30×. It raised the
  *measured* number only by making duration a required field.

### Slower, or more obligations?

The spec is right that conflating these cuts the wrong thing. Separated:

| category | sessions logging it, pre → post | steps/session, pre → post | min/step, pre → post |
| :--- | ---: | ---: | ---: |
| register | 40% → **98%** | 1.0 → 1.0 | 2.42 → **0.80** |
| verification | 87% → 68% | 1.0 → 1.0 | 5.90 → **22.67** |
| tests | 42% → **70%** | 1.0 → 1.0 | 1.69 → **24.98** |
| close-out | 20% → 19% | 1.0 → 1.0 | 2.00 → 10.44 |
| work (control) | 94% → 100% | 4.0 → 3.0 | 5.96 → 7.68 |

**No ceremony category acquired more steps.** The per-session count is 1.0 for
every category in both cohorts. What changed is **coverage** — the share of
sessions that log the category at all — which is instrumentation, not
obligation. `register` is the clean case: coverage rose 40% → 98% while its
per-step cost *fell* by two thirds, because `start_session` now logs it
automatically at the true moment instead of an orchestrator logging it late
and in a burst.

The one genuine **new obligation** is Set 111 S4's run-of-record: a session
must now execute and record its covered suites at close. That is a real,
non-artifactual cost, and §4 sizes it at **18.6 min/session**.

---

## 4. Reduction candidates

Every entry carries measured minutes, a named consequence, and an owner.
Candidates that only *move* cost, or that carry no measured minutes, are
listed as **disqualified** with the measurement that disqualified them —
because a reduction pass that cannot show its rejects is not auditable.

### C1 — Remediation round-trips · **33.8 min/session mean** · largest line item

| | |
| :--- | :--- |
| **Measured** | `remediation-review → remediation-review`: 62 transitions, median **18.1 min**, **2,332 min (38.9 h)** across 69 sessions. Marginal cost of a round, by regression: **+17.9 min of loop span** (R² 0.625, n=57) and +16.9 min of session total (R² 0.283). |
| **Latency split — NON-OPERATIVE** | *Derived from the gitignored, machine-local `ai_router/router-metrics.jsonl`; a fresh checkout cannot reproduce it, so nothing below depends on it and it may be struck without altering this candidate.* On one seat's 56 sessions, model latency accounted for **3.3 min of the 17.9-min round** and **8.0 min of the 33.5-min loop (24%)** — against a published 11%. If true it strengthens the case for cutting rounds over tuning models; **if false, C1's measured minutes are unchanged**, because they come from `sN-rounds.jsonl` alone. Treat as a hypothesis a committed instrument would have to confirm. |
| **Consequence** | **None, if the same findings are fixed in fewer round-trips** — the loop still runs to a non-blocking verdict. Verification is only reduced if the loop is made to *stop earlier*, which this candidate does not propose. |
| **Owner** | **Orchestrator** for fixing more completely per round. **Operator** for anything that stops the loop earlier — hard carve-out, never self-authorized. |
| **Note** | The lever is the *gate feeding* the rounds, which is **Session 2's question**, not a Session 3 cut. Lowering the bounds is an explicit non-goal of this set and is not proposed. |

### C2 — Recorded suite runtime · **18.6 min/session** · operator-owned

| | |
| :--- | :--- |
| **Measured** | Median **18.6 min** per instrumented session across a median of **3** recorded runs (n=59), = **19%** of the median session. Corpus: pytest 85 runs / 759 min (12.7 h) / median 9.53; playwright 51 runs / 388 min (6.5 h) / median 6.65; mocha 52 runs / 37 min / median 0.62. |
| **Consequence** | Cutting it means running fewer tests or covering less. That is a **verification reduction**. |
| **Owner** | **Operator**, unconditionally. Surfaced here with the measurement attached, not proposed. |
| **Note** | Set 116 already took the cheap 3.6× (xdist). What remains is coverage, not waste. |

### C3 — DISQUALIFIED: re-runs forced by staleness · **1.1 min/session**

The freshness gate re-running an unchanged tree was a real, documented cost
(fragments `0015` and `0016` each describe a session paying for it). It has
been fixed, and the measurement says so: of 52 repeat suite runs (273 min
total), only **13 runs / 67 minutes across the entire instrumented corpus**
were repeats where the `surfaceDigest` was unchanged — i.e. provably wasted.
That is **1.1 min per session**, and the median session's wasted re-run time
is **0.0 min**. Below noise. **Sets 116 and 119 already closed this; there is
nothing left to cut.**

### C4 — DISQUALIFIED: registration and close ceremony · **< 1.1 min/session**

`register` costs **0.80 min/step** post-cap — it is now the *cheapest* thing in
the session, and it got 3× cheaper, not more expensive. Close execution is
**0.2 min**. Together under 1.1 min. The spec's own guidance ("close execution
is not a cost; do not spend here") is confirmed and extends to registration.

### C5 — DISQUALIFIED: the `discovery → supplementary` stage · 4.6 min

Median **4.6 min**, 248 min corpus-wide across 44 transitions — the cheapest
transition measured. The rule that supplementary runs *before* remediating is
not where the money goes. Cutting it would return ~4.6 min and lose a
completeness pass.

### C6 — Not a candidate, recorded as a measurement-integrity residual

**Close the `stepKey` vocabulary.** Returns **zero minutes** and therefore does
not go on the candidate list. It is recorded because it is the reason §2.2
exists: with 1,427 distinct keys, the framework cannot attribute its own
ceremony cost, and any future set asking this question will hit the same wall
and pay to re-discover it. Set 120 S1's closed-vocabulary pattern (writer
strict, readers lenient about history on disk) applies unchanged. Session 2
is already applying that pattern to the severity field.

---

## 5. What Session 3 should and should not inherit

- **The cut list is short by measurement, not by timidity.** C3, C4 and C5 are
  disqualified by their own numbers — together they are worth under 7 minutes
  a session, and two of the three were already fixed by Sets 116 and 119.
- **The two real numbers are C1 (33.8 min/session) and C2 (18.6 min/session)**,
  and *both* are gated: C1's lever is Session 2's severity question, C2 is an
  operator-owned verification reduction.
- **"Nothing could responsibly be cut here" is a live possible outcome for
  Session 3**, and the spec pre-authorizes it. What is *not* available is
  cutting on the strength of the 2.3×, because the 2.3× does not survive
  re-derivation.
- **The corrected values the rest of the set inherits — all from committed
  artifacts**: loop **35.8 min**, tail **12.6 min** (of which 8.1 is suite
  runtime), round marginal cost **17.9 min**, suite runtime **18.6
  min/session**. **Model latency is deliberately not on this list**: the only
  instrument that measures it is gitignored, so Sessions 2 and 3 inherit no
  latency figure and must not size a cut against one.

## 6. Measurement-integrity notes

- **Data-quality defect found in passing:** at least four `activity-log.json`
  entries carry multi-sentence prose in the **`status`** field, and one carries
  a JSON list. `ai_router.session_log.log_step` refuses an unknown status
  today (Set 120 S1), so these are historical rows — the readers-lenient half
  of that contract is doing its job. Recorded, not corrected: editing a
  historical activity log to make a measurement tidier is exactly the
  hand-editing the constitution forbids.
- **`router-metrics.jsonl` is gitignored machine-local state**
  (`.gitignore:7`; untracked in this repo), begins 2026-08-05, and holds 323
  calls from one seat. It is therefore **excluded from every operative
  conclusion** in this document — see the quarantine note in *Method*. The
  single place it still appears (C1's latency split) is explicitly labelled
  non-operative and carries a statement that C1's measured minutes are
  unchanged if it is struck. **The framework has no committed instrument for
  routed-call latency**, which is itself worth recording: any future claim
  about the model-latency share of the loop is currently unverifiable from a
  fresh checkout.
- **Instrument coverage is the binding limit on this whole session.** The round
  ledger starts 2026-08-07 and the runtime ledger's durations start 2026-08-10.
  No pre-cap comparison is possible for either, and none is claimed.
