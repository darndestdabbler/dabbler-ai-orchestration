# Design consult: google/gemini-2.5-pro

Here is a concrete, opinionated recommendation for the measurement pilot.

### Executive Recommendation

We will instrument the two viable consumer repos to run the verification matrix pre-remediation. We will use an adjudicated union of findings as ground truth and enforce a strict "record-then-remediate" workflow. Telemetry will be centralized in the canonical repo via automated copy-back. The doc-only repo will be excluded. The biggest threat is inconsistent human adjudication of findings, which we will mitigate with a clear process and a simple reporting template.

---

### D1. TIMING: When to run the matrix?

**Recommendation: (a) As an extra review arm at Step-6 BEFORE remediation.**

**Justification:** The pilot's goal is to measure raw finding power on a "dirty" diff. This is the only point in the workflow where the diff is guaranteed to be in its freshly-built, pre-remediation state. Running it later (post-fix) measures noise, not findings. Running it as a separate pass introduces process friction and delays the feedback loop for the consumer, violating the "consumer-handoff" value proposition.

The workflow at Step 6 will be:
1.  CI build completes, producing the diff.
2.  **The matrix runs automatically.** The raw `verification-matrix-report.json` and `remediation-report.json` artifacts are immediately captured and archived for measurement.
3.  The generated `remediation-report.md` is made available to the developer.
4.  The developer proceeds with their manual review, using the `remediation-report.md` as an additional input stream.

### D2. GROUND TRUTH: How to establish it?

**Recommendation: (a) Use a human-adjudicated union of all findings as the ground-truth proxy now; treat formal defect seeding as a separate, future calibration exercise.**

**Justification:** The "ship now" constraint prohibits gating the pilot on a complex and artificial defect seeding benchmark. An adjudicated union is the most pragmatic and powerful alternative.

The process is:
1.  Collect all unique findings from every cell in the `remediation-report.json`.
2.  Collect all unique findings from the developer's manual review.
3.  The session owner (the human developer) adjudicates this superset, marking each item as a True Positive (TP) or False Positive (FP).
4.  This adjudicated list becomes the "ground truth" for that specific run. We can then calculate, for each cell, its `yield = (Cell's TPs / Total TPs)` and its `precision = (Cell's TPs / (Cell's TPs + Cell's FPs))`.

This measures the *relative power* of cells against the universe of defects that were actually present and discoverable by *at least one* agent (AI or human). This is immensely valuable and immediately actionable.

### D3. THE SCRUTINY-vs-MEASUREMENT TENSION: How to reconcile?

**Recommendation: Enforce a strict "record first, remediate second" policy.**

**Justification:** The tension is resolved by separating the act of measurement from the act of remediation. The CI pipeline is responsible for this separation.

1.  **Measurement:** The matrix runs on the initial diff. Its output artifacts (`*-report.json`) are immediately time-stamped, named according to the run (e.g., `<repo>_<commit-sha>_remediation-report.json`), and copied to the aggregation location. **This data is now immutable.**
2.  **Scrutiny:** The developer consumes the derivative `remediation-report.md` for their work. Any changes they make to the code from this point forward *do not affect the already-captured measurement*. The pilot measures what the AI *would have found*, which is precisely the goal.

This gives the developer the benefit of the AI's scrutiny without contaminating the experiment.

### D4. DOC-ONLY REPO: How to handle `dabbler-access-migration-orchestrator`?

**Recommendation: Defer this repo from the pilot entirely.**

**Justification:** Including this repo would compromise the pilot's integrity. The primary objective is to compare `push` (snippet-fed) vs. `pull` (repo-aware) surfaces on source code. A doc-only repo starves the `push` arm of any meaningful input, making the comparison invalid. It would add noise to the aggregated results and require special-casing the analysis. Focus the pilot on the two strong, comparable candidates to get a clean signal. A separate, prose-focused pilot could be considered later if necessary.

### D5. AGGREGATION HOME: Where to store telemetry?

**Recommendation: Copy artifacts back to a dedicated, `.gitignore`'d directory within the canonical `dabbler-ai-orchestration` repo.** For example: `dabbler-ai-orchestration/.telemetry/`.

**Justification:** This is the lowest-friction, most self-contained solution for a pilot.
*   **No new infrastructure:** It avoids setting up and managing permissions for a shared blob store.
*   **Centralization:** The data lives alongside the `aggregate` tool that will process it.
*   **Simple CI:** The consumer repo's CI pipeline can be given a Git PAT for the canonical repo to perform a sparse checkout, copy files, and push the new telemetry artifacts.

Leaving artifacts in-repo is a non-starter; it creates a distributed, high-permission-
