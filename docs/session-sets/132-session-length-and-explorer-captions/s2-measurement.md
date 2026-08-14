# Session length, re-measured on the fixed instrument

> **Session:** Set 132, Session 2 — *Fix the instrument before trusting it*
> **Date:** 2026-08-14
> **Instrument:** `ai_router/spec_admission.py` after this session's D1 and
> D2 fixes.
> **Purpose:** Reproduce Set 131's session-length probe with a corrected
> N, publish the corrected table, and say plainly whether the direction
> held. Per the spec, the **p90 tail is the primary result**, not a
> footnote.

---

## The short version

Three things changed, and one of them changes what Session 3 is asking.

1. **N was deflated.** 90 of 225 sessions had their work-step count
   corrected, almost all upward by one. Mean N went 2.83 → 3.26.
2. **The direction held, but weakly and with no explanatory value.**
   `corr(N, total minutes)` moved +0.202 → **+0.224**;
   `corr(N, minutes per step)` moved −0.191 → **−0.107**. The second
   number was never able to separate the two hypotheses (the spec's own
   algebra says so), and correcting the instrument halved it.
3. **The p90 tail is mostly a measurement artifact, and that is a third
   instrument defect.** Duration is `completedAt − startedAt`, which is
   elapsed *calendar* time. **Fifteen** of the 225 sessions paused
   overnight, and **all fifteen sit in the twenty-three longest sessions
   on record.** Excluding them takes the population p90 from **301 → 147
   minutes**. Trimming idle gaps instead takes it from 311 → **140**.

And one consequence the spec did not anticipate:

4. **The spec's argument that "constant w̄ does not fit the data" does not
   survive the fix.** That argument rested on a crude two-point fit
   yielding `F ≈ −16` minutes of per-session fixed overhead — impossible,
   therefore evidence that w̄ rises with N, which is the Parkinson reading.
   Refit on every row rather than two band medians, **F is positive on
   every duration measure and every estimator** (+20 to +41 minutes), and
   a constant-w̄ model with `F ≈ 39 min`, `w̄ ≈ 8.4 min/step` predicts the
   observed per-step medians to within about a minute at every N from 2 to
   6. Note precisely where the error was: the fits come out positive on
   the **old** instrument's N too (Section 4), so the impossible value was
   an artifact of fitting two band medians, not of the deflated N. The
   instrument fix is why the rest of this document is trustworthy; it is
   not what overturns this particular argument.

None of this establishes causation, and Section 7 says exactly what it
does not license.

---

## 1. Method, stated so it can be re-run and attacked

**Population.** Every session in `docs/session-sets/*/` that satisfies all
of:

- its set's `session-state.json` declares `schemaVersion: 4`;
- its `spec.md` yields a parseable plan for that session number
  (`parse_session_plans` returns a plan with at least one step);
- the session carries both `startedAt` and `completedAt`;
- the resulting duration is positive.

**Result: n = 225.** Excluded: 46 sets at schema v3; 17 sessions with no
parseable plan; 17 sessions with no timestamps. Set 131's probe reported
n = 220; this is the same filter run 220 sessions later in calendar
time — Set 131's own three sessions and Set 132 Session 1 have closed
since, and no session was excluded by hand.

**Duration** = `completedAt − startedAt`, in minutes. This is Set 131's
definition, kept deliberately so the two runs are comparable. Section 5 is
about why it is the wrong definition.

**N (fixed instrument)** = the count of steps `classify_steps` assigns the
role `work`: ceremony is a role the skeleton assigns by **position** (the
first slot, and the last three), confirmed by the step **naming** the
stage it stands for. Everything else is work.

**N (old instrument)** = Set 131's rule, "a declared step naming no
ceremony intent", computed by importing the pre-Set-132 module verbatim
from the revision immediately before this session's commit (it was
`git show HEAD:ai_router/spec_admission.py` while the work was
uncommitted; a re-runner after close-out wants the **parent** of the Set
132 S2 commit, not `HEAD`). Both instruments are run over **identical
rows**, so every difference below is the instrument and nothing else.

**p90** is the linear-interpolation percentile (the `numpy.percentile`
default). Stated because Set 131 did not state its own, and percentile
conventions differ by several minutes on samples this size.

**Bands** are Set 131's: `N ≤ 2`, `N = 3`, `N = 4–5`, `N ≥ 6`.

---

## 2. What the fix did to N

| | old instrument | fixed instrument |
| :--- | ---: | ---: |
| mean N | 2.83 | **3.26** |
| sessions in band `N ≤ 2` | 92 | 59 |
| sessions in band `N = 3` | 63 | 78 |
| sessions in band `N = 4–5` | 63 | 77 |
| sessions in band `N ≥ 6` | 7 | 11 |

**90 of 225 sessions (40%) had their N change.** The distribution of the
change is almost entirely one-directional:

| change in N | sessions |
| :--- | ---: |
| −7 | 1 |
| −1 | 1 |
| **+1** | **74** |
| +2 | 12 |
| +3 | 2 |

The +1s are D2: one work step per session that merely *mentioned*
verification, registration or close-out and was charged as ceremony. The
single −7 is D1 in its most extreme form (Set 107 Session 1 parsed at 16
steps; it declares 9).

This is the material fact for anyone re-reading Set 131's table: the band
boundaries did not just get noisier, **a third of the population moved
right by one band**.

---

## 3. The corrected table

Both instruments, identical rows, duration as Set 131 defined it.

**Old instrument (what Set 131 measured):**

| N | n | median min | p90 min | max | min/step | > 2 h |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| ≤ 2 | 92 | 52 | 199 | 623 | 41 | 16% |
| 3 | 63 | 51 | 136 | 1498 | 17 | 17% |
| 4–5 | 63 | 86 | 359 | 1028 | 19 | 33% |
| ≥ 6 | 7 | 114 | 920 | 1414 | 14 | 29% |

`corr(N, total) = +0.202` · `corr(N, min/step) = −0.191`

**Fixed instrument:**

| N | n | median min | p90 min | max | min/step | > 2 h |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| ≤ 2 | 59 | 51 | 145 | 623 | 32 | 14% |
| 3 | 78 | 52 | 310 | 1498 | 17 | 22% |
| 4–5 | 77 | 74 | 322 | 1028 | 17 | 27% |
| ≥ 6 | 11 | 114 | 591 | 1414 | 16 | 27% |

`corr(N, total) = +0.224` · `corr(N, min/step) = −0.107`

**Did the direction hold?** Yes for the median and for
`corr(N, total minutes)`, which is essentially unchanged (+0.202 →
+0.224) and remains weak. The median still rises with N: 51 → 52 → 74 →
114.

The **per-step** number is where the instrument mattered. `min/step` fell
41 → 17 → 19 → 14 on the old instrument and falls 32 → 17 → 17 → 16 on
the fixed one, and the correlation weakened by almost half. That is
expected and uninteresting: dividing by a larger N mechanically shrinks
the ratio. The spec is right that this metric cannot separate
amortization from Parkinson, and the corrected numbers do not rescue it.
It is reported here only because Set 131 reported it, and it should not
be quoted again.

The one number that got *worse* rather than better under the old
instrument is the `N ≥ 6` p90 (920 minutes) — an artifact of a band with
n = 7. It is 591 on the fixed instrument with n = 11. Neither is a fact
about step counts; Section 5 explains what it is a fact about.

---

## 4. Refitting `total = F + N·w̄`

The spec derives `per_step(N) = F/N + w̄(N)` and argues that because a
two-point fit on band medians gave `F ≈ 49 − 3(21.7) ≈ −16` minutes, and
negative fixed overhead is impossible, **constant w̄ does not fit the
data** — which it reads as consistent with the Parkinson hypothesis.

Refit on every row rather than two band medians, with both an
ordinary-least-squares and a robust Theil–Sen estimator (the duration
distribution is heavily right-skewed, so OLS alone would be led by the
outliers Section 5 is about):

| duration measure | n | OLS `F` | OLS `w̄` | Theil–Sen `F` | Theil–Sen `w̄` |
| :--- | ---: | ---: | ---: | ---: | ---: |
| elapsed, all 225 | 225 | 20 | 30.4 | 39 | 7.1 |
| elapsed, same calendar day | 210 | 31 | 15.4 | 35 | 6.6 |
| idle-trimmed at 45 min | 199 | 41 | 12.0 | 39 | 8.4 |

**`F` is positive on every measure and every estimator.** The impossible
value is gone, and with it the inference drawn from it. For comparison,
the same fits on the *old* instrument's N give `F` = 45–54 — also
positive, which means the spec's `F ≈ −16` was an artifact of fitting two
band medians rather than of the instrument alone. Both errors pointed the
same way and both are now corrected.

The stronger check is whether a **constant** w̄ reproduces the per-step
curve. Taking the Theil–Sen fit on the idle-trimmed measure — `F = 39`,
`w̄ = 8.4` — and predicting `F/N + w̄` against the observed medians:

| N | sessions | observed median min/step | predicted `39/N + 8.4` |
| ---: | ---: | ---: | ---: |
| 2 | 35 | 28 | 27.9 |
| 3 | 72 | 22 | 21.4 |
| 4 | 44 | 18 | 18.2 |
| 5 | 22 | 18 | 16.2 |
| 6 | 4 | 13 | 14.9 |

A model in which **each work step costs the same ~8 minutes and each
session pays ~39 minutes of fixed overhead** reproduces the observed
per-step decline to within about a minute from N = 2 to N = 4, which is
where 151 of the 199 sessions live. The falling per-step curve is the
`F/N` term, exactly as the amortization reading says, and there is no
residual rise in w̄ left for Parkinson to explain.

**This is consistency, not proof.** A constant-w̄ model fitting well does
not exclude a rising w̄ that the sample is too small and too confounded to
resolve, and the whole fit inherits the confound in Section 7. What it
does do is remove the *only* affirmative evidence the spec offered for the
Parkinson reading.

---

## 5. The tail — and a third instrument defect

The spec makes the p90 tail the primary result: 132 → 366 → 591 while the
median barely moves, and "the cap is calibrated against the statistic that
is not the problem."

**Most of that tail is not work. It is nights.**

Duration is `completedAt − startedAt`. Fifteen sessions were registered on
one calendar day and closed on the next:

| elapsed min | N | session |
| ---: | ---: | :--- |
| 1498 | 3 | 077 S6 |
| 1414 | 8 | 111 S4 |
| 1028 | 5 | 110 S4 |
| 934 | 4 | 107 S3 |
| 623 | 2 | 114 S1 |
| 562 | 3 | 096 S2 |
| 544 | 2 | 111 S1 |
| 509 | 5 | 110 S1 |
| 458 | 3 | 128 S2 |
| 426 | 3 | 106 S3 |
| 387 | 3 | 123 S3 |
| 386 | 4 | 101 S2 |
| 343 | 3 | 104 S2 |
| 315 | 3 | 118 S1 |
| 309 | 2 | 119 S2 |

Set 077 Session 6 "ran" 1498 minutes: started 15:46, closed 16:44 the
following day. Nobody worked 25 hours.

**All fifteen are in the twenty-three longest sessions on record — the top
~10%, which is precisely the region a p90 reports.** Split the population
on that one binary:

| population | n | median | p90 | max | > 2 h |
| :--- | ---: | ---: | ---: | ---: | ---: |
| all | 225 | 59 | 301 | 1498 | 22% |
| same calendar day | 210 | 53 | **147** | 591 | 16% |
| crossed a calendar day | 15 | 509 | 1259 | 1498 | **100%** |

The p90 halves. The longest same-day session ranks **sixth** overall.

A second, independent cut agrees. Using `activity-log.json` step
timestamps as evidence of when the orchestrator was actually working, and
counting each gap between consecutive marks at no more than 45 minutes:

| population | n | median | p90 | max | > 2 h |
| :--- | ---: | ---: | ---: | ---: | ---: |
| covered sessions, elapsed | 207 | 67 | 311 | 1498 | 24% |
| covered sessions, idle-trimmed | 207 | 67 | **140** | 480 | 16% |

The median is untouched (67 → 67) and the p90 falls by more than half.
That is the signature of an artifact concentrated in the tail.

**The idle threshold is not doing the work.** Sweeping it:

| idle cap (min) | n | median | p90 | max | sessions at the cap ceiling |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 199 | 48 | 100 | 283 | 0 |
| 30 | 199 | 58 | 121 | 379 | 0 |
| 45 | 199 | 70 | 141 | 480 | 0 |
| 60 | 199 | 74 | 157 | 540 | 0 |
| 90 | 199 | 75 | 188 | 631 | 0 |
| 120 | 199 | 75 | 201 | 721 | 0 |

At every threshold from 20 to 120 minutes the p90 lands between 100 and
201 and the maximum below 721 — nowhere near 1498. And **no session hits
its structural ceiling** of `cap × (marks − 1)` at any threshold, so the
measure is not simply counting how many steps a session logged.

Re-banding on the two clean measures:

**Same calendar day only (n = 210):**

| N | n | median | p90 | min/step |
| :--- | ---: | ---: | ---: | ---: |
| ≤ 2 | 56 | 48 | 115 | 30 |
| 3 | 71 | 49 | 132 | 16 |
| 4–5 | 73 | 71 | 194 | 17 |
| ≥ 6 | 10 | 98 | 320 | 15 |

**Idle-trimmed at 45 min (n = 199):**

| N | n | median | p90 | min/step |
| :--- | ---: | ---: | ---: | ---: |
| ≤ 2 | 55 | 51 | 106 | 32 |
| 3 | 73 | 62 | 141 | 21 |
| 4–5 | 70 | 74 | 169 | 18 |
| ≥ 6 | 9 | 78 | 161 | 13 |

The tail still rises with N on the same-day measure (115 → 132 → 194 →
320). On the idle-trimmed measure it rises and then **stops**: the `≥ 6`
p90 (161) is *below* the `4–5` p90 (169). The 132 → 366 → 591 explosion
that motivated this set does not survive either correction.

**Call this D3.** It belongs beside D1 and D2 and was found the same way —
by using the instrument rather than reading it. The difference is that D1
and D2 were defects in code this session could fix, and D3 is a defect in
what the timestamps *mean*: `startedAt` and `completedAt` are boundary
writes, and the interval between two boundary writes is not a measure of
effort. Nothing in this session changes that, and nothing should — the
timestamps are correct for what they are.

---

## 6. What did not change: the cap

`WORK_STEP_BUDGET = 3` was ratified by the operator on 2026-08-12 and this
session does not move it. The corrected numbers do not ask it to. On the
same-day measure the median goes 48 → 49 → 71 → 98: the step from `N = 3`
to `N = 4–5` still raises the median by ~45%, which is where the knee was
and still is.

What *did* need correcting is the claim printed beside the cap. Both
`spec_admission.py` and `session-set-authoring-guide.md` state that "the
longest sessions on record (591, 562, 544, 509 min) all declared 5–8
steps." Two things are now wrong with it: there are longer sessions on
record (1498, 1414, 1028, 934), and three of those four quoted figures
belong to sessions that crossed a night. Both surfaces are corrected in
this session's change set rather than left to echo (`project-guidance.md`
→ *propagate a consistency fix to every echo*).

---

## 7. What this does not establish

Unchanged from Set 131, and worth restating because the numbers above are
tidier than the last set's and tidiness invites over-reading:

- **The author chooses N already knowing how big the work is.** N and
  duration share a common cause. Every correlation and every fit here is
  observational and cannot settle causality. This is Session 3's problem
  and Session 3 should not treat Section 4 as having solved it.
- **A constant-w̄ model fitting well is not proof that w̄ is constant.** It
  removes the spec's affirmative evidence for a rising w̄; it does not
  supply affirmative evidence against one.
- **Band medians across sets doing genuinely different work are a hint.**
  The `N ≥ 6` band holds 9–11 sessions depending on the measure.
- **The idle-trimmed measure is a proxy, and it has a known bias:** it can
  only see time between logged marks, so a session that worked for an hour
  without logging a step is undercounted. The threshold sweep and the
  ceiling check bound how much that can matter; they do not eliminate it.
  The same-day split has no such bias and reaches the same conclusion,
  which is why both are reported.
- **The re-measurement does not license a change to N.** The spec's
  non-goal stands: N moves only on the operator's word.

## 8. What Session 3 inherits

- The descriptive question is answered, deterministically and for free.
  Do not send it to a panel (Set 131's trap T1).
- **The p90 tail question needs restating before it is asked.** "Why does
  the tail explode?" was posed against 132 → 366 → 591. On a duration
  measure that excludes sleep it is 132 → 194 → 320, or 141 → 169 → 161.
  The honest question for the panel is narrower: *why do a minority of
  sessions run 3–5× the median, and does step count have anything to do
  with it?*
- The observational fallback the spec names — estimate `F` from
  timestamped ceremony steps and test `w̄(N)` directly — is now possible,
  and Section 4 is a first pass at it. It is a starting point for the
  panel to attack, not a finding to defend.
- If a duration measure is used again, **say which one**. Elapsed calendar
  time is not working time, and the difference is the entire tail.

---

## Appendix: the probe

Four scripts, run from the repo root against
`.venv/Scripts/python.exe`. They are reproduced here rather than committed
because they read only committed state and produce no artifact beyond this
document; the population, filters and estimators in Sections 1 and 4 are
the specification, and this is one implementation of it.

- **`probe_session_length.py`** — builds the row set (Section 1), computes
  N under both instruments by importing the pre-fix module (see Section 1
  for which revision), and prints Sections 2 and 3.
- **`probe_sensitivity.py`** — adds `crosses_day` from the state file and
  the idle-trimmed duration from `activity-log.json`, and prints Section 5.
- **`probe_idle_robustness.py`** — sweeps the idle threshold and checks the
  structural ceiling.
- **`probe_fit.py`** — the OLS and Theil–Sen fits in Section 4.

The row set they produce (225 rows: set, session, minutes, declared steps
under each instrument, N under each instrument, `crosses_day`, marks,
idle-trimmed minutes) is the intermediate anyone re-running this should
reproduce first; every table above is a projection of it.
