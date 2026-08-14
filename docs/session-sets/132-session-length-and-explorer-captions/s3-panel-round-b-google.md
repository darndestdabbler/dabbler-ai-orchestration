<!-- routed: task_type=architecture, exclude_providers=['anthropic', 'openai'] (orchestrator provider + the provider that already answered); served by gemini-3.1-pro-preview / gemini-3.1-pro-preview, truncated=False, 50s. Raw, never edited. -->

## Where the other answer is wrong

1. **Pseudo-replication of the sample size (B).** B proposes "5 specs × 10 iterations = 150 total runs" to achieve 80% power. The independent unit of analysis is the *spec*, not the iteration. Variance between specs will wildly dwarf variance between iterations of the same spec. An effective sample size of 5 specs is severely underpowered for a generalized claim about AI behavior.
2. **"Concrete operations" proxy step count (B).** B proposes counting "distinct concrete operations (files read, files edited)" as the outcome. This replaces step-count with a lower-level proxy that is equally vulnerable to the treatment. A model padding a 5-step plan will simply hallucinate intermediate file reads or split test files to pad the operation count. It measures execution trace verbosity, not scope.
3. **Internal contradiction on time estimates (B).** B correctly identifies that self-reported time estimates are fatal ("models are text predictors"), but then D-i notes B wants to use "total planned execution burden in minutes, scored by raters from atoms." Asking a rater LLM to guess minutes from atoms is just moving the time-hallucination one step down the pipeline.

## D-i

**A's Extra Work Score (weighted optional atoms).** 

"Total execution burden in minutes" is unworkable because neither models nor humans can reliably assign minute-values to isolated, out-of-context atomic tasks. Furthermore, total scope drowns the experimental signal (the delta) in the massive noise of the baseline spec's mandatory complexity. Raters can reliably answer a binary question: "Is this atomic task strictly required to satisfy the brief's acceptance criteria?" Summing those optional/extra atoms isolates the exact inflation Parkinson's law predicts.

## D-ii

**Nobody knows the SD until a pilot runs.**

Both A's assumed SD of 4 points and B's assumed SD of 50 minutes are fabricated precision. Translating qualitative LLM plans into quantitative variables produces an unknown variance. 

**The pilot:** Run 10 cells (5 stratified specs × 2 arms: N=3 vs N=5, using the primary engine). Strip the plans, atomize them, and blind-score the Extra Work Score. Calculate the paired standard deviation of those scores. Use that empirical SD to power the full block design.

## D-iii

**Confounded (A).**

"Unconstrained" should not be run. Instructing a model to "use the minimal sufficient number of steps" changes the semantic objective of the prompt. You are no longer testing sensitivity to a numeric budget parameter (3 vs 5); you are testing parameter-filling vs semantic minimalism. Because it introduces a new variable, it does not provide a clean third point for a dose-response curve.

## D-iv

**A null result licenses a narrow, actionable claim:** "Explicit step budgets do not cause orchestrators to plan more initial work."

This does not rule out execution-stage rabbit holes (excess exploration, over-polishing, failed remediation). However, the study is still worth running because the *plan* is the only stage directly governed by the `N` parameter constraint. If bloat happens during execution, that is a tooling/agentic-loop failure, not a budget-parameter failure. A null result tells the operator to stop tweaking `N` to control costs and to focus entirely on execution guardrails.

## The observational result

**The composition reasoning is perfectly correct.** 
If high-N sessions are from the pre-skeleton era, their ceremony time is not absent—it is lumped inside their work steps. This means the measured $w̄$ for high-N sessions is artificially inflated. If the observed correlation between N and $w̄$ is *already* flat or negative despite this artificial inflation, then the true $w̄$ (with ceremony properly stripped) must be falling even faster. 

**The probe must restrict to skeleton-era (post-Set-128) sessions.** 
If this restriction leaves too few sessions for a clean regression, report the bounding logic above: the observed flat/negative trend is a conservative upper bound on Parkinson's. 

**The fixed overhead reading (F ≈ 40m, w ≈ 7m) renders the N debate second-order.** 
Fixed overhead is ~6x the cost of a work step. If this holds, the policy implication is immediate: tuning the `N` budget is a distraction. Shaving one work step saves 7 minutes; shaving 20% off the ceremony skeleton saves 8 minutes and applies to *every* session, regardless of N.

## Tail prediction

**Dominator:** Remediation loops (test failures/reruns). 
If a median work step is only 7 minutes, a 3-hour session tail is not caused by planning 10 extra steps. It is caused by getting stuck in an execution trap, failing and retrying the same step repeatedly. 

**Surprise:** I would be surprised if largest-gap share (idle time) dominates the *idle-trimmed* tail. If aggressive trimming still leaves idle gaps dominating the variance, our trimming heuristics are failing to capture actual developer AFK behavior.

## What we both missed

**Token bloat via rewrite vs. edit.** Models don't just pad scope by adding discrete steps or files; they pad by rewriting entire files instead of making surgical edits. A 3-step plan and a 5-step plan might have the exact same atomic obligations, but the N=5 plan might generate 4x the tokens by replacing files wholesale. Extra Work Score misses this entirely. 

**The experiment tests the wrong bottleneck.** Given F=40m, we are debating how to optimize a 7-minute margin. The experiment should not be run at all until the 40-minute ceremony is aggressively parallelized or compressed. 

## Minimum viable version

**The post-Set-128 observational probe.** 
Filter the 97 sessions to the skeleton era (where the 4 steps are reliably isolated). Recompute $F$ and $w̄$. 
**Cost:** ~2 hours of an analyst's time. Zero LLM API cost. 
If $F \gg w̄$ holds, declare `N` budget tuning a dead end and cancel the generative experiment entirely.