<!-- routed: task_type=architecture, prefer_model=gpt-5-5, exclude_providers=['anthropic']; served by ? (?). Raw, never edited. -->

## Verdict on the candidate design

**sound-with-modifications.** Randomizing the declared step budget while holding the work brief fixed is the right move for testing the *planning* mechanism, but not as stated. A single spec, same-model effort estimates, and unblinded step-list scoring would mostly measure prompt compliance and anchoring, not causal effects on session minutes.

## Attacks

1. **Self-estimated effort is the wrong primary outcome.** It measures the planner model’s narrative about its own plan, with budget anchoring baked in. It is valid only if estimation error is calibrated, arm-invariant, and independent of the same model’s planning choices. **Fix:** make the primary outcome a blinded scope score; keep independent calibrated effort estimates as secondary.

2. **Step count cannot be an outcome.** If the treatment is “up to 3” vs “up to 5,” more numbered steps may just be finer packaging. **Fix:** strip step structure before scoring and score atomic work obligations, not steps.

3. **One spec proves almost nothing.** It breaks the within-spec confound but creates an external-validity failure. **Fix:** use a locked battery of ~12 specs, stratified across docs/research, router Python, extension TypeScript/UI, and workflow/process tasks, with small/medium/near-cap examples.

4. **The estimand shifts from human-authored specs to model-authored plans.** If the real author is the operator, engine-generated plans are only an analogue. **Fix:** state the estimand as “budget sensitivity of AI planners” unless human authoring is included.

5. **Arm contamination is fatal only if outputs share context.** One conversation seeing all arms invalidates the comparison. Fresh stateless conversations are sufficient; persistent memory, copied prior outputs, or prompts naming the experiment are not. **Fix:** one arm per fresh conversation, randomized order, no prior-arm text.

6. **“Unconstrained” is not a clean treatment.** It mixes budget removal with model preference for decomposition. **Fix:** make N=3 vs N=5 the primary contrast; treat unconstrained as calibration/exploratory.

7. **Naive sample size will overstate evidence.** The independent unit is the spec×engine paired block, not the raw plan cell or rater count. **Fix:** power on paired differences.

## The design, as you would run it

**Arms:** max 3 work steps, max 5 work steps, unconstrained “use the minimal sufficient number of work steps.” Ceremony is fixed and excluded. Prompts must say “use fewer if sufficient; do not pad.”

**Unit:** one spec×engine block contains three isolated arm outputs. Primary inference is paired within block.

**Primary outcome:** blinded **Extra Work Score**: weighted atomic obligations in the plan that are not required by the fixed brief’s minimum acceptance criteria. Atomize plans, remove step numbers/budget wording, dedupe, then have two blind scorers classify/weight atoms. Secondary outcomes: total scope score, required-coverage failures, and independent blind effort estimates from a non-authoring model/rater calibrated against historical sessions.

**Blinding/randomization:** randomize arm order per block; fresh conversation per arm; scorers see only anonymized atom lists and the fixed task brief, not step count, engine, or arm.

**n:** material effect = at least **+2 weighted extra-scope points** or **+20% planned scope**, roughly enough to plausibly add 15–20 execution minutes. If paired SD is ~4 points, 80% power at α=.05 needs ~32 paired blocks; with three arms, clustering, and exclusions, target **48 blocks = 12 specs × 4 engines × 3 arms = 144 plan cells**.

**Pre-registered predictions:** Parkinson predicts N=5 produces materially higher Extra Work Score than N=3, with a monotone trend toward unconstrained. Amortization/null predicts no material scope increase: N=5 repackages the same work into more/finer steps. Parkinson is falsified for this design if the upper one-sided 95% CI for N5−N3 is below the material threshold and no monotone extra-scope trend appears.

## The observational fallback

**Worth running first.** It is cheap, uses already-collected logs, can directly estimate ceremony overhead, and will calibrate the experiment’s effect size. But it remains observational: high-N sessions still differ in underlying work.

Threats: step timestamps are boundary marks, not active work timers; gaps include idle time, tool waits, tests, and human pauses; ceremony is not purely fixed because verification/test/close-out can depend on work complexity; logs may be missing or uneven; corrected role classification may still misclassify edge cases; overnight and long idle gaps dominate tails unless trimmed. Run same-day and idle-trimmed variants with threshold sweeps, and treat the result as descriptive, not causal.

## The tail

The honest answer is that the original tail was mostly timestamp semantics: elapsed calendar time counted nights and idle. Among same-day or idle-trimmed tails, likely causes are remediation/test loops, flaky or expensive E2E/Playwright/VSIX paths, large touched surface area, routing/token/context cost, and occasional genuine hard implementation work. Step count is probably a weak marker for those causes, not the main driver.

Cheap discriminators already in the repo: compare tail vs non-tail sessions on max/count idle gaps, verification-round artifacts, test failures/reruns, `requiresE2E`/UAT flags, touched path families, diff size, number of routed calls/tokens, and ceremony-vs-work duration decomposition. If tails are ceremony-heavy, F/test/closeout dominates; if one work interval dominates, complexity dominates; if elapsed/trimmed ratios dominate, it is still idle.

## What you would drop

Drop same-model per-step effort estimates as primary evidence. Drop the single-spec study except as a pilot. Drop any multi-arm same-conversation run. Drop unconstrained as a primary arm. Drop any claim that the plan-only experiment explains the executed p90 tail. Drop the experiment entirely if it cannot reach roughly 40–50 paired spec×engine blocks.