# Panel round A — attack an identification strategy

You are one of two independent advisors, each from a different provider,
consulted on a **research-design** question. Your job is to **attack** the
design below and improve it — not to reinvent it, and not to be agreeable.
The other advisor is being asked the same thing independently; you will see
their answer in round B.

You have read-only access to this repository. The two files worth reading if
you want the primary evidence are
`docs/session-sets/132-session-length-and-explorer-captions/s2-measurement.md`
(the corrected measurement) and
`docs/session-sets/132-session-length-and-explorer-captions/spec.md`
(the set spec). Everything you need is also inlined below, so a failure to
read files is not a reason to stop.

---

## 1. The setting, in one paragraph

This repo runs an "AI-led session set" workflow. A human authors a `spec.md`
that decomposes work into numbered **sessions**; each session declares a
numbered list of **steps**. An orchestrator model executes one session per
conversation, logging each step. A ratified policy caps the number of
**work** steps per session at `WORK_STEP_BUDGET = 3` (plus 4 fixed ceremony
steps: register, verify, run tests, close out). Sessions carry `startedAt`
and `completedAt` timestamps, so session duration is measurable across 225
historical sessions.

**`N` = the number of authored work steps in a session.** The open question
is whether N *causes* session length.

## 2. What is already settled — do NOT re-answer this

A deterministic probe over 225 sessions has already been run twice (once on
a defective step-counting instrument, once on a fixed one). These results are
**inputs**, not questions. Advisors who re-derive them add nothing:

- `corr(N, total minutes) = +0.224` (weak, positive).
- `corr(N, minutes per step) = -0.107`. This metric is algebraically
  incapable of separating the two hypotheses, because
  `per_step(N) = F/N + w̄(N)` and the `F/N` term falls mechanically. Do not
  build anything on it.
- Median minutes by band (fixed instrument, elapsed time): N≤2 → 51,
  N=3 → 52, N=4–5 → 74, N≥6 → 114.
- **The p90 "tail explosion" was largely a measurement artifact.** Duration
  is `completedAt - startedAt`, i.e. elapsed *calendar* time. 15 of 225
  sessions paused overnight and **all 15 are in the 23 longest sessions on
  record**. Excluding them takes the population p90 from 301 → 147 min.
  Independently, trimming idle gaps in the step-timestamp log (any gap > 45
  min) takes p90 311 → 140, with the median unmoved (67 → 67). A threshold
  sweep from 20 to 120 min keeps p90 between 100 and 201 with no session
  hitting its structural ceiling.
- Re-banding on the clean measures, p90 by N is 115 → 132 → 194 → 320
  (same-calendar-day) and 106 → 141 → 169 → **161** (idle-trimmed — it rises
  then stops).
- Fitting `total = F + N·w̄` on every row (not band medians) gives **positive
  `F` on every measure and estimator** (OLS 20–41; Theil–Sen 35–39). A
  constant-`w̄` model with `F = 39 min`, `w̄ = 8.4 min/step` predicts the
  observed per-step medians to within ~1 minute for N = 2..4, where 151 of
  199 sessions live. This *removes the only affirmative evidence* previously
  offered for the "Parkinson" reading; it is **consistency, not proof**, and
  it inherits the confound in §3.

## 3. The confound that makes this a causal question at all

**The spec author chooses N already knowing how big the work is.** Large work
produces both more declared steps and more minutes. N and duration therefore
share a common cause, and no observational correlation over this corpus can
settle it. The two live hypotheses:

- **Parkinson** — a larger declared budget invites optional work, so `w̄(N)`
  (mean minutes per work step) *rises* with N.
- **Amortization** — per-session fixed overhead `F` (preload reads,
  registration, one verification round, close-out) divides across more steps,
  so the per-step number falls with `w̄` constant.

A prior scope-inflation check (median 0.0 unplanned steps; logged/declared
ratio 1.00 over 41 sessions) is **not** evidence against Parkinson: Parkinson
would appear as *the plan itself being larger when N permits it*, which that
check cannot observe.

## 4. The leading candidate design — attack this

This is the operator's own design (2026-08-14). The panel's job is to attack
it, not to replace it with a different topic.

> **Hold one spec fixed. Vary only the declared step budget across three arms
> (N = 3, N = 5, N = unconstrained). Have engines generate *only the plan* —
> the numbered step list plus a per-step effort estimate — and compare
> planned scope across arms. Because the underlying work is constant by
> construction, the author-chooses-N confound is broken: any scope difference
> between arms is attributable to the budget. It is cheap because nothing is
> executed.**

Specific weak points you are asked to probe, plus any you find yourself:

- **Estimate-vs-actual bias.** The measure is a *self-reported* effort
  estimate from the same model that authored the plan. What does that
  measure, and under what conditions is it a valid proxy for the minutes the
  original question is about? Is there a better primary outcome that is still
  cheap?
- **Does a single spec generalize?** One fixed spec makes the work constant
  but also makes the result a fact about that spec. How many, and chosen how?
- **Arm contamination.** If one engine sees all three budgets, does that
  invalidate the comparison? Within-subject vs between-subject, order
  effects, and whether a fresh conversation per arm is sufficient isolation.
- **Sample size.** How many spec × engine × arm cells are needed to detect a
  scope difference worth acting on? State an effect size you would consider
  material and the implied n, with your reasoning.
- **Construct validity.** "Planned scope" needs an operational definition.
  Step count is the treatment, so it cannot also be the outcome. What is the
  outcome variable, precisely, and how is it scored without the scorer
  knowing the arm?
- **What would falsify Parkinson under this design?** State the pre-registered
  prediction of each hypothesis, so the experiment can come back negative.

## 5. The observational fallback — evaluate it

Alongside the experiment, evaluate this cheaper alternative and say whether
it is worth running, worth running *first*, or not worth running:

> **Estimate `F` directly from timestamped ceremony steps.** Every session's
> `activity-log.json` carries a timestamp per logged step, and the fixed
> instrument now classifies each step as `work` or `ceremony` by role. So `F`
> (fixed overhead) can be measured as the time spent in ceremony steps rather
> than inferred from a regression intercept, and `w̄(N)` can then be tested
> *directly* — does mean work-step duration rise with N? — instead of through
> the `F/N + w̄` composite.

Name its threats to validity too (what the step timestamps do and do not
mean; selection effects; the idle problem from §2).

## 6. The tail question, restated honestly

The set was motivated by "why does the p90 tail explode?", posed against
132 → 366 → 591. On a duration measure that excludes sleep it is
132 → 194 → 320, or 141 → 169 → 161. So the honest question is narrower:

> **Why do a minority of sessions run 3–5× the median, and does step count
> have anything to do with it?**

Give your best answer to *that*, and — more useful — say what evidence
already in this repo would discriminate between the candidate explanations
you propose. Cheap, already-collected evidence beats an elegant study.

## 7. What is out of scope

- Do not propose changing `WORK_STEP_BUDGET`. That number moves only on the
  operator's word; this session produces a brief, not a change.
- Do not propose *running* the experiment now. It is designed here and run by
  a later session; your job is that it be runnable without re-deciding
  anything.
- Do not re-answer §2's descriptive statistics.

## 8. Output format

Markdown, no preamble. Be concrete and quantitative where you can. Use these
headings exactly:

- **Verdict on the candidate design** — one of `sound-as-stated`,
  `sound-with-modifications`, `fatally-confounded`. One paragraph of why.
- **Attacks** — a numbered list. Each entry: the weakness, why it bites,
  and the specific fix or the reason it cannot be fixed. Rank by severity.
- **The design, as you would run it** — arms, unit of analysis, primary
  outcome and how it is scored, blinding, randomization, n, and the
  pre-registered prediction of each hypothesis.
- **The observational fallback** — worth running / worth running first / not
  worth running, with reasoning and its threats to validity.
- **The tail** — your explanation(s), and the cheap evidence already in this
  repo that would discriminate between them.
- **What you would drop** — the parts of the above you judge not worth the
  money, stated plainly. An advisor who adds only cost is not helping.
