<!-- routed: task_type=architecture, exclude_providers=['anthropic', 'openai'] (orchestrator provider + the provider that already answered); served by gemini-3.1-pro-preview / gemini-3.1-pro-preview, truncated=False, 38s. Raw, never edited. -->

**Verdict on the candidate design**

`sound-with-modifications`. The core insight—breaking the author-chooses-N confound by fixing the work and letting the engine plan it—is analytically perfect. However, relying on the model's self-reported effort estimate as the primary outcome variable is fatally flawed. Models are text predictors; their time estimates reflect training-data priors for the words generated, not the causal compute/calendar time of the physical tasks. Without an independent measure of "scope," the design measures hallucination, not Parkinson's Law.

**Attacks**

1.  **Estimate-vs-actual bias (Fatal).** Models anchor self-reported estimates to the step count they just generated (e.g., assigning 15 mins to every step). It measures text generation priors, not execution scope. *Fix:* Strip the self-estimates. Use an independent, blinded LLM evaluator to score the *complexity* of the generated plan against a rubric, or use pairwise comparison (is Plan A more work than Plan B?).
2.  **Construct validity of "Scope" (Severe).** Because step count is the treatment, it cannot be the outcome. "Scope" needs a unit. *Fix:* The outcome variable must be the count of distinct concrete actions planned (e.g., files to edit, tests to write, commands to run) as extracted by a blinded parser.
3.  **Single spec fragility (Moderate).** A single spec might strictly constrain scope by its nature (e.g., "Change line 5") or invite open-endedness (e.g., "Refactor X"). One spec only proves how *that* spec behaves. *Fix:* Stratify. Draw 5 historical specs representing different archetypes (narrow bug, broad feature, refactor).
4.  **Arm contamination (Moderate).** If an engine sees its N=3 plan while generating its N=5 plan, it will just pad the N=3 plan. *Fix:* Strictly between-subject. Every inference call must be a completely fresh session with zero conversational memory of other arms.

**The design, as you would run it**

*   **Arms:** N=3, N=5, N=Unconstrained.
*   **Unit of analysis:** A fresh, zero-history inference session generating a plan for a fixed spec.
*   **Specs:** 5 historical specs (varied complexity).
*   **Primary outcome:** Count of distinct concrete operations (files read, files edited, tests written) + a blinded LLM complexity score (1-10 scale).
*   **Scoring & Blinding:** A separate, blinded evaluation prompt reads the generated plan (with step numbers stripped out) and counts the operations/scores complexity. The scorer does not know the assigned N.
*   **Randomization:** Run generation concurrently in isolated containers; order doesn't matter since sessions are stateless.
*   **Sample Size (n):** To detect a 20% shift in scope (Cohen's d ~0.6) at 80% power, we need ~45 runs per arm. 5 specs × 10 iterations × 3 arms = 150 total runs.
*   **Pre-registered predictions:**
    *   *Parkinson:* Blinded scope score for N=5 > N=3.
    *   *Amortization:* Blinded scope score for N=5 ≈ N=3 (null difference).

**The observational fallback**

*Worth running first.* It utilizes data already sitting in `activity-log.json` and costs zero API dollars.

By extracting the exact timestamps for the 4 fixed ceremony steps, we can calculate `F` per session empirically. We then subtract `F` from total time to get pure work time, and divide by `N` to test if empirical `w̄` rises with `N`.
*Threats to validity:* 
1. `F` might not actually be fixed. High-N sessions accumulate more context, meaning the closing/verification ceremony steps take longer due to token generation/processing limits. If `F` scales with `N`, attributing it to fixed overhead will mathematically suppress `w̄`.
2. Idle time within a step (e.g., a developer goes to lunch while a shell command runs) is still a massive confound if not aggressively trimmed at the sub-step level.

**The tail**

*Explanation 1: Context Bloat & Token Degradation.* As sessions drag on, context windows fill up. The orchestrator takes exponentially longer to process the prompt, and may trigger expensive context-summarization or recovery loops. 
*Explanation 2: Execution Traps.* The agent gets stuck in a retry-loop on a failing test or broken shell environment, burning time on identical operations.

*Cheap evidence to discriminate:*
Look at `activity-log.json` for the 225 historical sessions.
1. Plot `total tokens processed` against elapsed session time. If the tail is driven by bloat, the token count will scale super-linearly in the tail.
2. Count the number of identical or highly similar shell commands/tool calls per session. If execution traps cause the tail, the variance in tool-call repetition rates will perfectly predict the p90 tail explosion.

**What you would drop**

I would drop the generative experiment entirely unless the observational fallback is inconclusive. The experiment requires building a complex, blinded LLM-as-a-judge pipeline to measure a subjective "scope" construct. The observational fallback uses objective, already-paid-for telemetry. Do the timestamp math first; only run the experiment if the telemetry math fails to break the tie.