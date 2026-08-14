<!-- routed: task_type=architecture, prefer_model=gemini-3-1-pro, exclude_providers=['anthropic']; served by ? (?). Raw, never edited. -->

**Verdict on the candidate design**

sound-with-modifications. Holding work constant and varying only the declared budget is the right causal move, but as stated it measures self-justifying forecasts from the planning model, on one task, with an outcome dangerously close to the treatment. It can identify whether budget changes **planned scope**, not whether N directly changes actual elapsed session minutes, unless the outcome is independently scored and the sample is broadened.

**Attacks**

1. **Self-estimated effort is not a valid primary outcome.** It measures the model’s belief, anchoring, and desire to rationalize its own plan, not execution minutes. It is valid only if calibrated to actual idle-trimmed session durations and unbiased by arm, which is unlikely. **Fix:** record it as secondary only; primary should be arm-blinded independent execution-burden scoring of the plan.

2. **Step count cannot be the outcome, and step lists leak the arm.** If scorers see “3 steps” vs “5 steps,” blinding is mostly fiction. **Fix:** convert each plan into unique atomic work commitments with step numbers, model IDs, and budget language removed; score burden from atoms, not steps.

3. **One spec is not evidence about the workflow.** It would answer only whether that task has optional-scope affordances. **Fix:** use a fixed panel of about 12 task packets, stratified by task type and baseline size: docs/process, Python/router, VS Code extension/UI/test, and research/design; include low-, medium-, and high-ambiguity tasks.

4. **The treatment must be a cap, not an exact count.** “Write N steps” forces decomposition and creates artificial padding. **Fix:** arms should say “at most 3 work steps,” “at most 5 work steps,” and “no explicit work-step cap,” with identical non-goals and acceptance criteria.

5. **Plan-only tests only one Parkinson pathway.** It can show budget-induced scope expansion at authoring time, but misses execution-stage expansion: extra exploration, remediation, or optional polishing after the plan is accepted. **Fix:** describe the study as a mechanism test. A negative result falsifies actionable **plan-scope Parkinson**, not all possible N effects.

6. **Arm contamination is real if one conversation sees multiple budgets.** The model will compare arms or reuse prior reasoning. **Fix:** one fresh conversation per spec × engine × arm; no mention of other arms; randomized call order; same decoding settings; no transcript carryover.

7. **The scorer can still infer arm from verbosity.** More verbose plans may reveal the treatment even after redaction. **Fix:** score from normalized atom decks, ask scorers to guess arm after scoring, and report sensitivity if arm-guess accuracy is materially above chance.

8. **No materiality threshold means any tiny effect can be overread.** A statistically nonzero +4 minutes is not operationally meaningful. **Fix:** pre-register materiality: at least +20 predicted active minutes or +2 optional work atoms for cap-5 vs cap-3 is actionable; below +10 minutes and +1 atom is practically null.

**The design, as you would run it**

Arms: cap-3, cap-5, and uncapped, all phrased as maximum allowed work steps. Unit of analysis: the paired spec × engine block; generated plans are observations, but inference is on within-block arm contrasts.

Use 12 preselected task packets × 5 engines × 3 arms = 180 generated plans. If only 4 engines are available, use 15 specs to keep 60 paired blocks. This gives about 80% power for a material +20 minute effect if the paired-difference SD is around 50 minutes: `n ≈ ((1.96 + 0.84) * 50 / 20)^2 ≈ 49`, with margin for unusable outputs.

Primary outcome: arm-blinded planned execution burden, in minutes, scored by independent raters from unique non-ceremony atomic commitments. Each task packet gets a prewritten minimum-acceptance checklist. Raters classify atoms as required vs optional and assign effort using a locked rubric. Primary contrast is total planned burden; key secondary is optional/excess burden. Same-model per-step estimates are secondary diagnostics only.

Randomization: fresh conversation per cell, randomized arm order within each spec × engine block, no cross-arm context, no prompt language revealing that other budgets exist.

Pre-registered predictions: Parkinson predicts monotonic burden increase, especially optional burden: cap-5 > cap-3 and uncapped ≥ cap-5, with at least one policy-material contrast. Amortization/no-plan-scope effect predicts equal unique burden across arms, with differences only in packaging. Actionable Parkinson is falsified if the upper confidence bound for cap-5 minus cap-3 is below the material threshold, especially if optional burden is also flat.

**The observational fallback**

worth running first. It is cheap and useful for calibration, but it is not a causal estimate and should not be called “direct F” without caveats. Step timestamps are boundary marks, not start/stop timers; gaps can include idle time, tool waits, human interruption, verification, or unlogged work. Ceremony time is also not purely fixed: tests, verification, and close-out can scale with diff size and failure count.

Run it as gap accounting with sensitivity cuts: same-day only, idle-trimmed thresholds, and alternative conventions for attributing gaps to preceding vs following steps. Threats are selection into schema-v4/logged sessions, era/model changes, rare high-N cells, role-classification errors, and the fact that N remains confounded with task size. It is still worth doing first because it can show whether residual long sessions are dominated by ceremony/verification gaps before spending on the experiment.

**The tail**

The best answer is: the original tail was mostly idle/sleep; the remaining tail is probably a mixture of verification/test/remediation loops, flaky or heavy E2E work, large surface-area diffs, and research/design sessions with long reasoning gaps. Step count is likely a proxy for task size and number of opportunities to hit delays, not the main cause.

Cheap discriminators already in the repo: compare the longest same-day or idle-trimmed sessions against N-matched median sessions; compute largest-gap share from `activity-log.json`; count verification-round artifacts and remediation loops; flag `requiresE2E` and Playwright/test-heavy sessions; collect git diff files/LOC; classify session type from specs; count routed verification/child artifacts where logged. If N loses signal after max gap, verification rounds, E2E flag, and diff size, the tail is not a step-count story.

**What you would drop**

Drop the single-spec version, same-model effort estimates as primary evidence, any within-conversation multi-arm prompt, and any plan scorer who can see step numbers or budget language. If cost must be cut, drop the uncapped arm before cutting specs or engines; cap-3 vs cap-5 is the policy-relevant contrast. Drop further descriptive correlation work unless it adds gap, verification, test, or diff-size evidence.