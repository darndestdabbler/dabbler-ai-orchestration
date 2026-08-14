<!-- routed: task_type=architecture, prefer_model=gpt-5-5, exclude_providers=['anthropic']; served by gpt-5.5 (gpt-5.5), tier 0, truncated=False, $0.0000, 233s. Raw, never edited. -->

## Where the other answer is wrong

1. **B: “Primary outcome: total planned burden, in minutes.”** Wrong primary. Total burden conflates optional inflation with better required coverage. A cap-5 plan that includes required testing omitted by cap-3 would look like “Parkinson,” when it is actually higher-quality planning.

2. **B: “paired-difference SD is around 50 minutes.”** Unsupported. Executed-session variance is polluted by fixed ceremony, idle, tests, and remediation. The SD must come from the blinded atom-score pilot, not historical elapsed minutes.

3. **A/B: uncapped as dose-response evidence.** Invalid if treated confirmatorily. “No cap; use minimal sufficient steps” is not a higher dose than cap-5; it removes the numeric anchor and changes the instruction.

4. **A: “Drop the experiment entirely if it cannot reach 40–50 paired blocks.”** Too blunt. The binding constraint is pilot-estimated paired SD plus scorer reliability. Forty blocks may be enough; eighty may still be waste.

5. **Both underweighted quality noninferiority.** Saving planned work by omitting required acceptance criteria is not a policy win.

## D-i

**Primary outcome: A’s Extra Work Score, with required-coverage as a gate.**

The policy question is not “does cap-5 produce a larger plan?” It is “does cap-5 induce unnecessary extra work?” Total burden answers the wrong question unless required coverage is identical, and it often will not be.

The reliability objection is real but manageable: the minimum acceptance checklist must be locked before generation. Raters then map anonymized atoms to that checklist. If required-vs-optional coding cannot reach acceptable agreement, the task packet is not scorable and should be dropped or rewritten. Minute estimates should be secondary translation only; they are noisier than ordinal weighted excess-scope points.

## D-ii

**Nobody knows the SD yet. Pilot first.**

Use a **48-cell pilot**: 6 specs × 4 engines × 2 arms, cap-3 vs cap-5 only. That gives 24 paired blocks to estimate paired SD of the Extra Work Score, scorer agreement, and arm-guess leakage.

Decision rule: material effect = **+2 weighted excess-work points**. Full required block count is:

`n = ((1.96 + 0.84) * paired_SD / 2)^2`

So if paired SD is 4, about 31 blocks; SD 5, about 49; SD 6, about 71. Run the full study only if scorer reliability is acceptable and required `n` is operationally sane. Do not use B’s 50-minute SD unless it comes from this scoring pipeline.

## D-iii

**The uncapped arm is confounded for the confirmatory study. Do not use it as dose-response evidence.**

The confirmatory contrast should be cap-3 vs cap-5. If a third arm is needed for dose response, use cap-4, not uncapped.

Uncapped may be run only as a separate exploratory benchmark for “current/no-cap behavior,” clearly excluded from the Parkinson test and power calculation.

## D-iv

**B is right: plan-only tests only the authoring pathway.**

A null result licenses this claim only:

> Raising the declared planning cap from 3 to 5 does not materially increase blinded optional/excess planned work in the tested specs and engines.

It does **not** show that N cannot affect elapsed session time through execution-stage exploration, remediation, test reruns, polishing, or close-out behavior.

Given the new observational numbers, the full plan-only study is probably not worth funding unless a step-cap policy decision specifically depends on authoring-scope evidence. A pilot is still defensible; a 144–180-cell full run is low priority.

## The observational result

The composition hypothesis is likely right. If older high-N sessions lack explicit ceremony skeleton steps, their ceremony time is being charged into work. That inflates high-N `w̄`. Therefore the observed flat-to-falling `corr(N, w̄)` is, if anything, biased toward finding Parkinson. The true curve likely falls more.

Skeleton-era restriction is trustworthy only if it leaves real N spread. If post-Set-128 has mostly low-N sessions, it can validate `F` but cannot estimate the N slope. The probe must report N-by-era counts, per-bucket sample sizes, idle-trim variants, distinct-mark subsets, bootstrap CIs, classifier audit results, and a sensitivity that reallocates plausible missing ceremony from pre-skeleton work totals.

The `F ≈ 40` and `w̄ ≈ 6–8` reading holds: fixed ceremony is roughly **5–7 work steps**. That makes the N debate second-order for median duration. Policy should focus first on reducing or tiering ceremony/verification/close-out overhead, not shaving one planned work step.

## Tail prediction

I expect **verification/remediation loop count** to dominate the residual same-day tail, especially failed tests, reruns, Playwright/VSIX/E2E paths, and close-out retries.

I would be surprised if N remains strongly predictive after controlling for verification loops, E2E/test-heavy flags, diff size, and largest-gap share. I would also be surprised by long-tail sessions with small diffs, clean first-pass verification, no E2E, and no dominant gap.

## What we both missed

The full N experiment may simply not be worth running now. The observational result shifts the highest-value question from “does N inflate work?” to “why does each session carry ~40 minutes of ceremony?”

We also missed that specs and engines are not iid interchangeable units; inference needs clear population boundaries. And we under-specified the quality gate: cap-3 is not better if it saves time by omitting required work.

Do not run the uncapped confirmatory arm. Do not run a single-spec study. Do not run the full plan-only study unless the pilot shows reliable scoring and plausible material effect.

## Minimum viable version

Fund the corrected observational probe, not the full experiment: skeleton-era stratification, ceremony/work reallocation sensitivity, manual audit, and tail discriminator model.

Cost: **0 new plan cells**, existing logs plus roughly **1–2 engineer-days**. If an experiment is still required afterward, run only the **48-cell cap-3 vs cap-5 pilot**.