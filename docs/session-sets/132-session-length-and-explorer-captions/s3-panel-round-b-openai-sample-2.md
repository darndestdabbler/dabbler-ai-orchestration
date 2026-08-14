<!-- routed: task_type=architecture, prefer_model=gemini-3-1-pro, exclude_providers=['anthropic']; served by gpt-5.5 (gpt-5.5), tier 0, truncated=False, $0.0000, 47s. Raw, never edited. -->

## **Where the other answer is wrong**

1. **“Primary contrast is total planned burden.”** Wrong primary. Total burden is easier to score superficially, but it muddies the causal question: cap-5 could raise total burden by improving required coverage, not by inducing Parkinson expansion. The actionable worry is **optional scope inflation**, so excess/optional burden must be primary, with coverage failures reported separately.

2. **“Uncapped ≥ cap-5” as a Parkinson prediction.** Under-argued. Uncapped is not a dose point above 5; it removes the salient numeric anchor. A model may produce fewer steps when told “minimal sufficient” than when shown “at most 5.” Treating it as monotone dose-response is conceptually wrong.

3. **“+20 predicted active minutes” as materiality.** Too large if the actual observed `w̄` is 6–8 minutes. A +20-minute planned-burden threshold equals roughly 3 work steps. The policy question is whether allowing 5 instead of 3 invites one or two extra obligations, not only whether it adds a third of a session.

4. **“Drop further descriptive correlation work unless it adds gap, verification, test, or diff-size evidence.”** Too dismissive now that the observational probe found `F ≈ 40`. The immediate policy lever may be ceremony compression, so descriptive decomposition is no longer fallback; it is central.

## **D-i / D-ii / D-iii / D-iv**

**D-i. Primary outcome: Extra Work Score.** Use blinded weighted optional/excess atomic obligations as primary, not total planned minutes.

Total burden is noisy because it combines three things: required coverage, optional expansion, and rater effort calibration. If cap-5 plans cover more required acceptance criteria than cap-3, that is not Parkinson; that is a quality difference. The clean estimand is: **does a higher step cap cause the planner to add work not needed to satisfy the brief?**

The objection that “required vs optional” is judgmental is real, but manageable: prewrite the minimum acceptance checklist before scoring, force raters to classify each atom against that checklist, report inter-rater agreement, and adjudicate disagreements. Minutes should be secondary because raters are usually worse at estimating effort than at classifying obligation type.

**D-ii. Sample size: pilot first, then power on Extra Work Score.** Nobody knows the paired SD yet. Neither SD=4 scope points nor SD=50 minutes is currently grounded enough to bind the design.

Run a pilot of **6 specs × 4 engines × 2 arms = 48 plan cells** for cap-3 vs cap-5 only. Score atoms fully blind. Estimate the paired SD of `cap5 - cap3` Extra Work Score and the rater reliability. Then commit:

- If paired SD ≤ 3 weighted points, run **~32 paired blocks** total.
- If SD is 3–5, run **~50 paired blocks** total.
- If SD > 5 or rater agreement is poor, the outcome is too noisy; revise the rubric before scaling.

Do not power on minutes unless minutes become the primary outcome, which they should not.

**D-iii. Uncapped arm: do not run in the main experiment.** It is confounded, not merely lower priority.

“Uncapped/minimal sufficient” changes both the numeric budget and the prompt psychology. It may reduce anchoring, increase autonomy, or invite the model’s default decomposition style. That is not a clean dose-response arm. The policy-relevant causal question is **cap-3 vs cap-5**. If later you want a separate default-planning study, run uncapped there, but do not mix it into the primary Parkinson test.

**D-iv. Conclusion: null only rules out plan-authoring scope inflation.** B is right here.

A null result licenses this operational claim: **raising the declared work-step cap from 3 to 5 does not materially increase optional scope in the initial plan, for tasks like the sampled specs and engines, under isolated prompting.** It does **not** prove that N has no effect on execution time, because expansion can occur during implementation, verification, remediation, or polishing.

The study is still worth running only if the operator is considering changing the planning cap. If the actual policy question is elapsed session time, the observational decomposition and execution-tail probes now look higher-value than a large plan-only experiment.

## **The observational result**

The composition hypothesis is probably right. If post-Set-128 sessions have explicit ceremony steps and older high-N sessions compress or omit ceremony labels, then high-N ceremony is being mischarged into work. That contaminates `w̄` upward at high N. So a flat-to-falling `corr(N, w̄)` is likely an overestimate of any Parkinson effect, not an underestimate.

The trustworthy probe must report:

1. Skeleton-era-only results, even if underpowered.
2. Pre/post-Set-128 stratification.
3. Same-day and idle-trimmed variants.
4. Distinct-mark-only subset.
5. How many sessions remain per N bin, especially for N ≥ 6.
6. A sensitivity model that reallocates plausible missing ceremony time from high-N work totals back into ceremony.

If skeleton-era restriction leaves too few high-N sessions, then the honest conclusion is “the dataset cannot estimate high-N ceremony/work decomposition cleanly,” not “high-N has almost no ceremony.”

The `F ≈ 40` and `w̄ ≈ 6–8` reading does hold: fixed overhead is roughly the cost of **5–7 median work steps**. That makes the N debate second-order for elapsed-time policy. Reducing ceremony by 10 minutes is worth more than shaving one normal work step; reducing ceremony by 20 minutes dominates almost any cap-3 vs cap-5 effect unless higher N reliably causes multiple extra obligations.

Policy implication: keep a reasonable cap, but prioritize ceremony compression, verification gating, and close-out/test overhead before optimizing N.

## **Tail prediction**

I expect the residual same-day tail to be dominated by **verification/remediation loops**, visible as repeated test/check artifacts, failure reruns, or close-out blockers. Largest-gap share will explain idle-contaminated tails, but after same-day/idle trimming I expect verification loops to dominate more than raw N, diff size, or routed-call count.

I would be surprised if `requiresE2E` alone dominates after controlling for verification rounds, or if N remains a strong predictor after max-gap share, verification/remediation count, and diff size are included.

## **What we both missed**

The biggest miss: the plan-only experiment may no longer be the best next dollar. The observational result says fixed ceremony is the largest median cost center. If the operator wants shorter sessions, the first intervention should be on ceremony and verification workflow, not on step caps.

We also missed that historical schema changes can invalidate role-based decomposition unless era-stratified. The ceremony result is not just a weird artifact; it is a warning that any longitudinal model mixing pre/post skeleton sessions needs explicit schema-era controls.

Do not run a full 144–180-cell plan experiment until the pilot shows reliable scoring and a nontrivial signal. Do not run the uncapped arm in the main experiment. Do not treat the plan-only null as evidence about execution-stage Parkinson effects.

## **Minimum viable version**

Fund **one thing**: a skeleton-era observational decomposition plus a cap-3/cap-5 pilot.

Cost: **48 plan cells** for the pilot, plus the existing 97-session log analysis rerun with era stratification and sensitivity reallocations. That is enough to decide whether a full planning experiment is justified and whether ceremony reduction is the higher-return policy lever.