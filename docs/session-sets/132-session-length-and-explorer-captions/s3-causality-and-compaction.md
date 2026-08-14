# Why long sessions are long, what N should be, and where compaction fires

> **Session:** Set 132, Session 3 of 3 — *Why the tail, what N should be, and
> where compaction fires*
> **Date:** 2026-08-14
> **Inputs:** `s2-measurement.md` (the corrected measurement), Set 131 S3's
> rotation section in `docs/ai-led-session-workflow.md`, and a two-provider
> panel whose raw rounds are `s3-panel-round-{a,b}-{openai,google}.md`.
> **Status:** the N recommendation is a **brief for the operator**, not a
> change. Nothing here moves `WORK_STEP_BUDGET`.

---

## The short version

**The question this set was built to answer turns out to be second-order, and
that is the finding.**

1. **Fixed overhead is 5–7× the cost of a work step.** Estimated two
   different ways: the regression intercept in `s2-measurement.md` §4
   (`F` = 39 min, Theil–Sen) and a direct partition of ceremony-step
   timestamps in this session (`F` = 41 min median over 97 sessions). **These
   are not independent confirmations** — both rest on the same
   `startedAt`/`completedAt` boundary writes, and this session's work and
   ceremony totals sum by construction to exactly the elapsed duration
   Session 2 regressed. What agrees is a *fitted intercept* and a *measured
   partition* of the same interval, which is worth something and is not two
   witnesses. A median work step costs 6–9 minutes. Shaving one work step
   saves ~7 minutes; the ceremony skeleton costs ~40–60 on **every** session
   regardless of N.
2. **Directly measured `w̄` does not rise with N.** `corr(N, w̄)` = −0.03
   (elapsed), −0.17 (idle-trimmed), −0.13 (restricted to sessions where every
   work step carries its own mark). This is the test the `F/N + w̄` composite
   could not perform, and it is the first evidence here that bears on
   Parkinson directly rather than through an algebraically doomed ratio.
3. **The residual tail's strongest observed discriminator is the
   verification loop, not step count.** Among sets 111+, the count of
   verification artifacts a session produced correlates with its duration at
   **+0.767**; N correlates at **+0.228**. This is a ranking of unmodelled
   correlations, and the arrow's direction is genuinely unresolved — a long
   session has more opportunity to open another round, as much as another
   round makes it long. Both panel providers predicted this ranking *before*
   seeing the numbers.
4. **The experiment this session was asked to design should not be funded
   yet** — and both providers said so unprompted, on evidentiary grounds,
   before the operator said so on cost grounds. The design is specified below
   anyway, because specifying it is cheap and re-deciding it later is not.
5. **Nothing is added to answer the operator's prevention question.** The
   rubric that answers it already exists and is already preload.

---

## 1. The panel, and what it cost to get an honest one

### 1.1 A transport defect found by using it

The panel was dispatched with `route(prefer_model=...)`, pinning one advisor
to `gpt-5-5` and one to `gemini-3-1-pro`. **All four generations came back
served by `gpt-5.5`.**

`pick_model` was innocent — called directly it returns `gemini-3-1-pro` for
exactly those arguments. The defect is one layer up:
`_route_via_copilot_cli` **does not accept `prefer_model` at all**. That
profile resolves exactly one generator *role* from the seat catalog instead of
walking a tier ladder, so a parameter the public `route()` signature accepts,
documents, and validates is **silently dropped** on this transport while being
honoured on `api`.

This is L-125-1 (*compare what a transport CAN DO, not what it returns*)
recurring in a new place, and it is invisible from the call site: the calls
succeeded, returned plausible and *differently-worded* analyses, and the
metrics rows recorded `served_model_mismatch: false` — because gpt-5.5 was
faithfully served, it just was not what was asked for.

**Repair.** `exclude_providers` *is* honoured by the copilot-cli path, against
the catalog's confirmed entries:

| exclusion | resolves to |
| :--- | :--- |
| — | `claude-sonnet-4.6` (anthropic) |
| `[anthropic]` | `gpt-5.5` (openai) |
| `[anthropic, openai]` | `gemini-3.1-pro-preview` (google) |

The google half was re-run that way; both its calls are confirmed served by
`gemini-3.1-pro-preview` in their artifact headers. The two mislabeled files
were **renamed** to `-openai-sample-2`, not edited and not deleted, so the
record shows what actually happened: four samples from openai, two from
google. The router defect is a **named residual** (R3, below) — fixing a
routing seam inside a documentation session is scope this session did not
declare.

### 1.2 What the panel was and was not asked

Sent: the identification strategy, the design's weak points, the observational
fallback, and the restated tail question. **Not sent: the descriptive
question** — Set 131 named that trap (T1) and `s2-measurement.md` §8 repeats
it. An advisor asked to opine on an unconditioned average produces confident
prose about a number that was already computed deterministically for free.

Round A was independent generation; round B showed each advisor both answers,
anonymised, and required it to attack the other, resolve four named
disagreements, and react to the observational probe run between the rounds.
Google's round B critiqued its own round A as "B", not knowing it was its
own — and did so harshly, which is a small piece of evidence that the
adversarial framing worked.

---

## 2. The identification strategy

### 2.1 What both providers killed

Both, independently and in identical terms:

- **Self-reported effort estimates cannot be the primary outcome.** "Models
  are text predictors; their time estimates reflect training-data priors for
  the words generated" (google); it "measures the planner model's narrative
  about its own plan, with budget anchoring baked in" (openai). The operator's
  design named a per-step effort estimate as the measure. **It has to go**, to
  a secondary diagnostic at most.
- **Step count cannot be the outcome**, because it is the treatment. A cap-5
  plan with more numbered steps may be the same work packaged more finely.
- **One spec is not evidence.** It breaks the confound and buys an
  external-validity failure in exchange.
- **Arm contamination is fatal only through shared context.** Fresh, stateless
  conversation per cell is sufficient isolation; the experiment must never be
  named in the prompt.
- **Nobody knows the paired standard deviation**, so nobody can compute `n`
  yet. Both round-A answers asserted an SD (4 scope points; 50 minutes) and
  both round-B answers called the other's fabricated — openai called its own
  side's blunt "drop it below 40 blocks" rule too blunt for the same reason.

### 2.2 The four disagreements, resolved

Both converged in round B, from opposite round-A positions:

| | resolution |
| :--- | :--- |
| **D-i primary outcome** | **Extra Work Score** — weighted atomic obligations *beyond* the brief's locked minimum acceptance checklist — not total planned burden in minutes. Total burden conflates inflation with *better required coverage*: a cap-5 plan that adds the testing a cap-3 plan omitted would score as Parkinson while actually being better planning. Minutes are added back only as a secondary translation. |
| **D-ii sample size** | **Unknowable until a pilot runs.** `n = ((1.96 + 0.84)·SD / 2)²` for a material effect of +2 weighted excess-work points → ~31 blocks at SD 4, ~49 at SD 5, ~71 at SD 6. The pilot estimates SD, scorer agreement and arm-guess leakage; the full run is conditional on all three. |
| **D-iii the uncapped arm** | **Confounded — do not run it.** "Use the minimal sufficient number of steps" is not a larger dose of the same treatment; it removes the numeric anchor and changes the instruction's semantics. If a third dose point is wanted, it is **cap-4**. |
| **D-iv what a null licenses** | Only: *"raising the declared planning cap from 3 to 5 does not materially increase blinded optional planned work, in the tested specs and engines."* It says **nothing** about execution-stage expansion — exploration, remediation, polishing. Google's framing is the useful one for the operator: a null tells you to stop tuning `N` for cost and to put the effort into execution guardrails instead. |

### 2.3 The design, as it would be run

Recorded so a later set can execute without re-deciding anything:

- **Arms:** cap-3 vs cap-5, phrased as *maxima* ("at most N work steps; use
  fewer if sufficient; do not pad"), with identical non-goals and acceptance
  criteria. Optional third dose point: cap-4. **Not** uncapped.
- **Unit of analysis:** the paired spec × engine block. Plans are
  observations; inference is on within-block arm contrasts.
- **Specs:** ~12 task packets stratified by archetype (narrow fix, broad
  feature, refactor, docs/process, research) and by baseline size, each with a
  **locked minimum-acceptance checklist written before generation**.
- **Isolation:** one fresh zero-history conversation per cell, randomised arm
  order, identical decoding settings, no cross-arm text.
- **Scoring:** plans are atomised into unique work commitments; step numbers,
  budget language, engine identity and verbosity cues are stripped; two blind
  raters classify each atom required-vs-optional against the locked checklist
  and weight it. Raters are asked to **guess the arm afterwards**; materially
  above-chance accuracy invalidates the blinding and is reported.
- **Pre-registered predictions.** Parkinson: Extra Work Score rises
  monotonically, cap-5 > cap-3. Amortization/null: unique obligations equal
  across arms, differing only in packaging. **Falsified** when the upper
  one-sided 95% bound on (cap-5 − cap-3) sits below the material threshold.
- **Quality gate, which both providers said both round-A answers missed:**
  cap-3 is not a win if it saves time by dropping required work. Required
  coverage is a non-inferiority gate, not a secondary curiosity.
- **Pilot first:** 48 cells (6 specs × 4 engines × 2 arms), or google's
  leaner 10 (5 specs × 2 arms, one engine). Estimate SD and scorer
  reliability; proceed only if both are sane.

### 2.4 And the recommendation is not to run it yet

Unprompted, in the *"what we both missed"* slot:

> "The full N experiment may simply not be worth running now. The
> observational result shifts the highest-value question from 'does N inflate
> work?' to 'why does each session carry ~40 minutes of ceremony?'" — openai
>
> "The experiment tests the wrong bottleneck. Given F=40m, we are debating how
> to optimize a 7-minute margin." — google

Both nominated the same **minimum viable version**: the skeleton-era
observational decomposition, **zero routed calls**, existing logs only.

The operator independently ruled on cost mid-session — *"I can't afford to
spend hundreds of dollars on this. I can live with results that are
suggestive, as opposed to definitive and statistically reliable"* — which
lands in the same place from the other direction. Both are journalled in
`decisions.jsonl`. The rigorous design above is preserved as the upgrade path,
not the plan.

---

## 3. The observational fallback, run rather than evaluated

Both providers said run it first. It was run — after round A, before round B,
so the panel could attack the result rather than the proposal. Probe:
`s3_probe_overhead.py`.

**Method.** Walk each session's logged marks in time order; the interval
ending at a `complete` mark is charged to that mark's step; the step's role
comes from Set 132 S2's corrected `classify_steps`. Per-**step** figures are
not reported, because a batch-logged run of steps charges all its elapsed time
to whichever member sorts first.

**Batch logging, and where the robustness claim actually holds.** An earlier
draft claimed per-role totals were robust to batch logging outright. Both
path-aware critics caught that, and they were right: the claim holds *within*
a role, but a batch written at one instant that **crosses** the
work/ceremony boundary charges the whole interval to whichever role sorts
first. The probe now counts those batches — **10 of 97 sessions** contain one
that ends a non-zero interval — and reports the cut with them removed.
Detection is on identical timestamps rather than a tolerance window, so marks
a fraction of a second apart remain separate intervals. The result does not
move: median `w̄` stays **6.4**, `corr(N, w̄)` goes −0.029 → **−0.027**, and
median `F` rises 41.1 → **47.0**, which if anything widens the `F`/`w̄` gap
this document rests on.

**Population: n = 97**, and the exclusions are larger than the headline
suggests. By reason: 33 sessions have no parseable plan or no timestamps, 0
have a non-positive duration, 0 have no `complete` marks, and **129 are
dropped because a logged step number falls outside today's parse** — the
seeded plan was written by the pre-Set-132 parser and disagrees with the
corrected one, so the role mapping would be wrong and the session is dropped
rather than guessed at. That is the single largest filter and it was
undisclosed until the critique; it is **not** neutral by construction. What it
is *not*, checked rather than assumed, is era-concentrated: the surviving 97
span every set decade (050s=15, 060s=21, 070s=9, 080s=4, 090s=1, 100s=5,
110s=11, 120s=24, 130s=7).

### 3.1 `F` measured, not inferred

| | median `F` (ceremony min) | median `w̄` (work min ÷ N) |
| :--- | ---: | ---: |
| all 97, elapsed | **41.1** | **6.4** |
| all 97, idle-trimmed at 45 min | 41.1 | 6.4 |
| same calendar day (93) | 39.4 | 6.0 |
| no mixed-role batch (87) | 47.0 | 6.4 |
| every work step separately marked (71) | 56.6 | 7.4 |
| skeleton-era only (22) | **61.6** | **8.9** |

`s2-measurement.md` §4 estimated `F` = 39 (Theil–Sen) / 20–41 (OLS) as a
**regression intercept over 199–225 sessions**. This probe measures it as
**observed clock time in ceremony steps over 97 sessions**. The constant-`w̄`
model's 8.4 min/step likewise matches the skeleton-era measured 8.9.

**What that agreement is, stated precisely.** An earlier draft called these
two estimates independent and said they "share no arithmetic". Both critics
rejected that and the sharper of the two objections is arithmetic: this
probe's ceremony and work totals **sum by construction to
`completedAt − startedAt`**, which is exactly the elapsed duration Session 2
regressed. So the two are a *fitted intercept* and a *measured partition* of
**the same interval**, and both inherit the boundary-write semantics Session 2
itself named as defect D3. That the intercept lands where the partition lands
is a real consistency check on the *decomposition* — a badly-specified split
would not reproduce the fit — but it is **not** two witnesses agreeing, and
nothing downstream should treat it as corroboration of the interval itself.

### 3.2 `w̄` against N, directly

| population | `corr(N, w̄)` |
| :--- | ---: |
| all 97, elapsed | −0.029 |
| all 97, idle-trimmed | −0.173 |
| every work step separately marked (71) | −0.132 |
| skeleton-era only (22) | −0.401 |

**No measure shows `w̄` rising with N.** Parkinson's central prediction is that
it does.

### 3.3 The composition artifact, confirmed — and what it costs the result

Ceremony time appeared to collapse as N rose: ~50–57 min at N ≤ 3, 7.1 min at
N = 4–5, 1.9 min at N ≥ 6. The panel was asked to attack the hypothesis that
this is **composition, not behaviour**. It is:

| N band | median ceremony steps declared | share that are skeleton-era |
| :--- | ---: | ---: |
| ≤ 2 | 4.0 | 59% |
| 3 | 2.0 | 21% |
| 4–5 | 1.0 | 8% |
| ≥ 6 | 1.0 | **0%** |

The four-step skeleton was only mandated at Set 128. High-N sessions are
overwhelmingly *older* specs where the classifier finds one compressed tail
step or none — so their ceremony time is not absent, it is **charged to their
work steps**.

Both providers then drew the same inference, and it is the one that matters:
this contaminates `w̄` **upward at high N**, so the observed flat-to-falling
`corr(N, w̄)` is a **conservative upper bound** on any Parkinson effect. The
true curve falls at least as fast as measured. As google put it: "if the
observed correlation is *already* flat or negative despite this artificial
inflation, then the true `w̄` must be falling even faster."

**What the probe still owes, stated rather than buried.** openai's round B set
the honest test: the skeleton-era restriction is trustworthy only if it leaves
real N spread. **It does not.** The 22 skeleton-era sessions carry N ∈ {1, 2,
3} and nothing above — *because the cap itself removed the variance*. So the
skeleton-era cut **validates `F` and cannot estimate the N slope**. The
correct conclusion is openai's: *"the dataset cannot estimate high-N
ceremony/work decomposition cleanly"* — not "high-N sessions have no
ceremony". That is a limit of the corpus, and no amount of re-cutting fixes
it; only the experiment in §2.3, or a period of authoring above the cap,
would.

One more threat, raised by google in round A and worth reporting because the
probe can answer it: **`F` may not be fixed** — a high-N session accumulates
more context, so its closing ceremony might cost more, which would
mathematically suppress `w̄`. Measured on the skeleton-era cut,
`corr(N, F) = +0.267`: mildly positive, on n = 22. Not nothing, not enough to
overturn a 5–7× ratio, and it is exactly what transcript rotation (§5) exists
to attack.

---

## 4. The tail: what actually distinguishes a long session

`s2-measurement.md` established that most of the original p90 explosion was
**nights** — 15 of 225 sessions crossed a calendar day and all 15 sit in the
23 longest. This section is about what remains.

Probe: `s3_probe_tail.py`, over 226 sessions (211 same-day). The **residual
tail** is the top decile of same-day sessions by idle-trimmed minutes
(n = 21).

| median of | tail | rest |
| :--- | ---: | ---: |
| elapsed min | 197 | 49 |
| idle-trimmed min | 141 | 51 |
| **N** | **4** | **3** |
| marks logged | 12 | 6 |
| largest gap (min) | 74 | 31 |
| **largest-gap share** | **0.36** | **0.61** |
| **verification artifacts** | **6** | **3** |
| `requiresE2E` share | 24% | 7% |

Correlation against session duration, whole corpus and then within the recent
era (sets 111+, where artifact conventions are stable — sessions got longer
over time *and* recent sets write more artifacts, so the whole-corpus ranking
could otherwise be one era effect wearing two hats):

| discriminator | vs elapsed (n=211) | vs elapsed, sets 111+ (n=47) |
| :--- | ---: | ---: |
| **verification artifacts** | **+0.572** | **+0.767** |
| marks logged | +0.415 | +0.662 |
| verification rounds ledgered | +0.227 | +0.386 |
| **N** | **+0.255** | **+0.228** |
| test runs recorded | +0.131 | +0.128 |
| largest-gap **share** | −0.081 | −0.261 |

**The strongest observed discriminator for "why are long sessions long" is
the verification loop, not step count.** Within the era whose conventions we
can trust, verification artifacts out-predict N by more than 3×. This is a
ranking of raw correlations, not a causal claim — see the caveat below.

Two supporting details:

- **The residual tail is not idle.** Largest-gap *share* is **lower** in the
  tail (0.36 vs 0.61) and correlates **negatively** with duration. Long
  sessions are long throughout, not because of one big pause. (Raw
  largest-gap correlates at +0.666, but a gap is bounded above by the session
  containing it, so that number is structural; the share is the honest form.)
- **`requiresE2E` is over-represented 3.4×** in the tail, consistent with the
  chronic Layer 3 flakes both S1 and S2 disclosed as composites.

**This was predicted before it was measured.** Both providers were given the
`F`/`w̄` numbers and told the tail discriminators "are being computed", then
asked to commit:

> "I expect **verification/remediation loop count** to dominate the residual
> same-day tail… I would be surprised if N remains strongly predictive after
> controlling for verification loops." — openai
>
> "**Remediation loops (test failures/reruns).** If a median work step is only
> 7 minutes, a 3-hour session tail is not caused by planning 10 extra steps.
> It is caused by getting stuck in an execution trap." — google

Both were right, and google's *surprise* condition also held: idle share did
not dominate the idle-trimmed tail.

**What this is not.** It is observational and partly tautological in
direction — a session that runs long has more opportunity to open another
round, as much as another round makes it run long. It cannot say which way the
arrow points. What it *can* say, and what the set asked for, is that **the
defensible answer to "why the tail" is not "more steps"**, and the candidate
that replaces it is the verification/remediation loop.

---

## 5. Compaction: the trigger, and its coupling to N

Set 131 S3 already fixed the trigger, and this session does not move it.
Restated so the coupling has one home:

**Rotate at ~150K retained input tokens, at the first step boundary after the
threshold is crossed.**

- **150K** is where the measured cost curve leaves its plateau: 7.65–9.76
  credits/inference below it, 17.18 immediately above, 35.77 above 300K.
- **The boundary rule survives untouched.** What a step boundary already
  produces — the step logged, the state file current, the next step's inputs
  named — *is* most of what a flush must preserve.

### 5.1 Why it cannot fire at every boundary

A flush costs a measured **400 credits** and is only worth it if enough
expensive inferences follow it to repay that. At the 150–300K band the saving
is roughly 17.18 − ~8.7 ≈ **8.5 credits/inference**, so payback needs ~**47**
inferences (Set 131 states ~30–42 depending on where the post-flush context
lands); above 300K the saving is ~27/inference and payback is ~**15**.

**The self-defeating part is what makes an every-boundary policy absurd**: a
flush *resets* the transcript to ~54K, which is inside the cheap 25–75K
plateau. A second flush at the next boundary therefore pays 400 credits to
save approximately **nothing** — there is no elevated cost left to remove. A
session declaring N = 3 has 7 steps and 6 internal boundaries; firing at all
six would cost 2,400 credits, of which at most the first could ever repay.

**Therefore: threshold-crossing boundaries only. The boundary says *when* it
is safe to flush; the threshold says *whether* it is worth flushing.**

### 5.2 The coupling, stated in one place

> **N determines how many boundaries exist. The threshold determines which of
> them fire.**
>
> They cannot be tuned independently. Fewer steps means fewer chances to flush
> a transcript that is growing anyway, so a *lower* N pushes the first
> eligible boundary later and lets the transcript run more expensive for
> longer. More steps means more candidate boundaries, which is only a benefit
> because the threshold is what stops them from all firing. A future set that
> lowers N must check that the remaining boundaries still land near the 150K
> crossing; a future set that lowers the threshold must check it is not
> creating the every-boundary policy §5.1 forbids.

This is also where §3.3's leftover threat lands: `corr(N, F) = +0.267` hints
that ceremony may cost more in longer, more context-heavy sessions. Rotation
is the lever that attacks that directly, and it does so **without touching
N at all** — which is the same conclusion §6 reaches from the other side.

---

## 6. The operator's prevention question — answered inside the existing rubric

**The question.** *"What is the risk (probability × impact) of not doing this
work? If low, then unnecessary."*

**Is anything being added? No.** No new gate, no new config key, no new CLI,
no new artifact, no new close-out predicate. This is the single most important
sentence in this section, because *Prefer removal over addition* says a fix
that adds a surface must justify itself, and this one cannot — the mechanism
already exists.

**What already exists.** L-095-1, promoted into `project-guidance.md` →
*Conventions* → *Workflow Expectations*: "Grade verification severity by
**CONSEQUENCE**. Probability the stated failure scenario hits a real user ×
impact. Low probability **or** low impact is Minor; no nameable failure
scenario is a nit." The operator's question **is** that rubric, evaluated
about a *proposed step* instead of a *reported finding*. It is preload
already, so extending it costs nothing to carry.

**The extension**, which is a scope statement rather than a new rule: the
consequence test applies at **plan authoring** as well as at severity triage.
Before a step enters a spec, name the failure scenario that follows from *not*
doing it. No nameable scenario → the step is a nit and does not belong in the
plan. Low probability **or** low impact → it is Minor, and Minor work is the
first thing cut when a session is over budget.

**It is a removal tool by construction.** The test can only ever *delete* a
step. It has no branch that adds one, which is why it does not violate
*Prefer removal over addition* — it is an instance of it.

**And it is worth exactly what it is worth.** §3 measured a work step at 6–9
minutes. Cutting one unnecessary step saves that. It is real and it is small,
and it should not be oversold on the same page that establishes fixed overhead
is 5–7× larger.

---

## 7. Education-mode brief: what should N be?

**Where the set stands.** Sessions 1 and 2 are complete and verified. Session
2 fixed the two instrument defects and re-ran the measurement; this session
ran the causal design past two providers, decomposed `F` and `w̄` directly,
and found that the strongest observed correlate of a long session is the
number of verification rounds it ran, not its step count. Everything above is
done. This brief is the one thing that needs you.

**The question, in one sentence.** Should `WORK_STEP_BUDGET` stay at 3?

**Options and consequences.**

| option | consequence |
| :--- | :--- |
| **Keep N = 3** (recommended) | Nothing changes. The corrected data still shows the median stepping up between N = 3 (49 min) and N = 4–5 (71 min), so the knee you ratified on 2026-08-12 is where you left it. Costs nothing; forgoes an unmeasured amount of merging-related overhead saving. |
| Raise to N = 4 | You rejected this yourself on 2026-08-12. Expected cost on this session's numbers is ~7–9 min of additional work time per session (one `w̄`), which is ~10–15% of a median session. There is no affirmative evidence *for* it — the direct `w̄` test is flat-to-falling, which removes the argument against a rise but supplies none in favour. |
| Lower to N = 2 | Saves ~7–9 min per session but adds a whole session's fixed overhead (~40–60 min) whenever it forces work to split. Given `F` ≈ 5–7 `w̄`, this is very likely a net **loss**, and it collides with §5.2: fewer boundaries means later flushes. |
| Defer until the experiment runs | The experiment is not funded (your cost ruling, plus both advisors independently recommending against it now). Deferring to it is deferring indefinitely. |

**Recommendation, with confidence.** **Keep N = 3.**
*High confidence* that the evidence does not support **raising** it, and that
N is the wrong lever regardless: fixed overhead is 5–7× a work step, so
ceremony compression dominates any plausible N change.
*Low confidence* that 3 is the precise optimum — nothing here identifies an
optimum, and §3.3 explains why the corpus **cannot**: the cap has already
removed the variance that would be needed to find one.

**The default if you do not answer.** N stays 3. Nothing in this set changes
it, the spec's non-goal already says so, and no code path here reads it.

### 7.1 The operator answered: ceiling 4, target 3

**Ruled 2026-08-14, reversing the 2026-08-12 ratification** (which had
rejected N = 4 as "a deliberate loosening"). The policy is a **ceiling of
N = 4 with 3 retained as the stated target**: the authoring guide says aim
for 3, the admission test refuses above 4.

**The orchestrator recommended keeping 3 and was overruled, on an argument
this document supplies but did not follow to its conclusion.** The brief above
priced a *raise* — ~7–9 minutes per session — and stopped there. It did not
price the *other* error. An extra session costs a whole `F`, and `F` is 6–7
work steps. So the two failure modes are wildly asymmetric:

| error | cost |
| :--- | :--- |
| ceiling one step too generous | ~7–9 min, only when a spec actually uses it |
| ceiling one step too tight, forcing a split | ~40–60 min (one full `F`) |

A ceiling that avoids even a **1-in-7** chance of a forced split pays for
itself. And the original justification for 3 — the median stepping up between
N = 3 and N = 4–5 — is exactly the confound §8 disclaims: the author chooses N
knowing the work, so bigger work produces both more steps and more minutes.
Nothing in the observational record shows that *permitting* a fourth step
lengthens a session; the direct `w̄` test says it does not.

Keeping 3 as the **target** matters and is not decoration: a bare ceiling gets
read as a quota, which is the one Parkinson mechanism this set could not rule
out.

**Not implemented here, deliberately.** `WORK_STEP_BUDGET` lives under
`ai_router/`, which all three suites declare in `covers`, so changing it in
this session would invalidate two runs of record already recorded, discard a
Layer 3 run in flight, and owe another routed remediation-review — while this
set's own *Ends with* promises "an N recommendation on the operator's desk
with its evidence, **not a changed number**." It is the first act of the
follow-on set, which must re-run those suites anyway. Nothing is at risk in
the gap: no spec is being authored, and `start_session` never consults the
admission test. Journalled in `decisions.jsonl`.

**The follow-on worth more than this question.** If you want shorter sessions,
the measured target is the ~40–60 minutes of ceremony every session pays, and
the verification loop that is the tail's strongest correlate — not the step
budget. That is the next set, and R1 below is a concrete, already-identified
instance of it.

---

## 8. What this does not establish

- **Nothing here is causal.** Every number is observational. The author still
  chooses N knowing the work; §3's direct `w̄` test weakens the Parkinson
  reading considerably but cannot exclude it, and §4's tail finding cannot
  orient its own arrow.
- **`corr(N, w̄) ≤ 0` is not proof `w̄` is flat.** It is the *conservative*
  direction given §3.3's contamination, which is stronger than §2's evidence
  was, but it is still a correlation over a confounded corpus.
- **The skeleton-era cut cannot estimate the N slope**, only `F`. Said plainly
  in §3.3 rather than left for a reader to notice.
- **`F` is measured on 97 sessions, not 225.** The exclusions are itemised in
  §3: the largest by far is the **129 sessions whose logged step numbers fall
  outside today's parse**, dropped because the role mapping would be wrong.
  That filter is not neutral by construction, though it is checked to be
  spread across every set decade rather than concentrated in one era.
- **The two `F` estimates are not independent** (§3.1). They partition and
  regress the *same* interval, and both inherit the D3 boundary-write
  semantics. Their agreement checks the decomposition, not the interval.
- **The attribution rule is robust to batching only within a role** (§3).
  Ten of 97 sessions contain a role-crossing batch; removing them does not
  move `w̄` or the correlation, and raises `F`.
- **The tail discriminators are unmodelled correlations**, reported with an
  era control and no multivariate control. "+0.767 vs +0.228" is a **ranking,
  not an effect size**, and the direction of the arrow is explicitly not
  claimed: a session that runs long has more opportunity to open another
  verification round, as much as another round makes it run long.
- **No compaction implementation.** Set 131's non-goal stands; this set fixes
  the trigger's shape and coupling only.

---

## 9. Named residuals

**R1 — `cite_lessons` stales the verification stamp** (carried from the spec;
unchanged). Now with a measured price attached: it buys a routed round on a
delta of two bookkeeping files, and §4 says rounds are what long sessions are
made of.

**R2 — `vsix-first-run-walkthrough.spec.ts` is a chronic flake inside a close
gate** (carried; unchanged). §4's `requiresE2E` finding is consistent with it.

**R3 — `route(prefer_model=...)` is silently ignored on the copilot-cli
transport** (new, §1.1). The public signature accepts and documents a
parameter that one transport drops without warning. A caller cannot tell from
the return value or the metrics row. Fix should either honour it (map the
alias through the catalog) or **refuse it loudly** on that profile; per
L-112-1 the fix owes a falsifier on both transports. Not fixed here: it is a
routing seam, and this session's declared surface is documentation.

**R4 — the automated path-aware-critique producer is wired to one transport
only** (new). `python -m ai_router.pull_critique` fails on a Copilot seat with
`missing API key (env 'DABBLER_OPENAI_API_KEY')`. The obvious reading of that
message is wrong and worth correcting in the record: **path-aware review is
not unavailable on this transport.** It is arguably more native here — routed
children are dispatched as agentic CLI processes carrying
`--available-tools view,grep,glob` (`cli_transport.py`, `READ_ONLY_TOOLS`), so
they hold genuine read-only repo access by construction, which is exactly what
"path-aware" means.

What fails is the **producer's wiring**. `ai_router/pull_verifier.py` contains
no reference to transports at all: it implements its own tool loop against
provider SDKs and resolves `api_key_env` per provider. The asymmetry is about
*who supplies the agentic loop* — on `api` the router must build it, which
needs direct SDK access; on `copilot-cli` the CLI **is** the agent and brings
its own tools. So the seat that needs a hand-rolled loop least is the one the
producer refuses.

This is R3's family: transport-conditional behaviour that the call site cannot
see. Two instances in one session is the argument for treating it as a class
rather than two bugs (L-069-1). This set used the **manual flow**, which the
template calls the default and which is unaffected — but a set that assumed
the automated producer was simply unavailable to Copilot seats would have
drawn the wrong conclusion about its own capabilities.

---

## Appendix: the probes

Both are committed beside this document, unlike Session 2's, because they are
the evidence for a policy recommendation and a re-runner should not have to
reconstruct them from prose.

- **`s3_probe_overhead.py`** — §3. Per-role time attribution, the `F`/`w̄`
  decomposition, the composition check and the skeleton-era cut.
- **`s3_probe_tail.py`** — §4. Tail discriminators, the era control, and the
  correlation table.

Run from the repo root with `.venv/Scripts/python.exe`. Both read only
committed state and write nothing.
