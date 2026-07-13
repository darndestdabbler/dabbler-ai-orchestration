ISSUES FOUND

- **Issue 1: The convergence replay does not demonstrate the required materially lower cost against the Set 095 baseline**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The phased loop is released as empirically validated for substantially cheaper convergence on difficult, initially defective sessions, but a typical real session begins with unresolved defects like Set 095’s original workload. This replay instead begins after all 39 baseline Majors were already remediated, so future users may not obtain the advertised reduction from 17 rounds/$4.88 to 4 rounds/$0.85. This is probable because starting before remediation is the normal workflow, while the replay tested an already-clean R20 tree.
  - **Details:**
    - **Violation:** The task requires “the 095-corpus replay demonstrates bounded convergence at materially lower cost” and identifies it as “the falsifier for the whole set.”
    - **Impact:** The principal empirical acceptance criterion remains untested. A reasonable reviewer cannot attribute the cost reduction to the phased loop when the compared runs processed materially different defect workloads.
    - **Evidence:** `docs/session-sets/096-consequence-graded-phased-verification/s2-convergence-replay.md` states that the replay starts at `b16dd58`, where “all 39 remediated Majors are fixed,” and processes five latent findings plus one fix-induced finding. It compares that with the moving Set 095 run that discovered and remediated 39 findings. The added qualifications correctly acknowledge that this is not a defect-for-defect A/B, but `change-log.md` and `ai_router/CHANGELOG.md` still promote the 4-round/$0.85 versus 17-round/$4.88 comparison as the set’s falsifier and materially lower-cost evidence.
    - **Fix:** Replay the phased loop from the same pre-remediation Set 095 state and equivalent evidence base used by the baseline, preserving call/cost evidence. Otherwise, classify the existing replay only as an end-to-end machinery demonstration and do not claim that the required comparative-cost falsifier was satisfied.

- **Issue 2: The ledger reopens settled findings and assigns IDs to occurrences rather than stable findings**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On the normal two-cycle remediation path, one fix is rejected while several others are accepted. The next review must nevertheless emit verdicts again for every accepted finding, every duplicate fan-out report, and every restatement from intervening rounds. Because this system is explicitly designed around salience-limited LLM reviewers, omission of one redundant ID is probable on a growing ledger; the machine then creates a blocking coverage defect and can suspend the loop at its two-cycle cap even though the omitted underlying fix was already accepted.
  - **Details:**
    - **Violation:** The shipped policy says, “A settled point is never re-opened under fresh wording,” and the task requires the no-resurrection ledger “as machinery.” It also describes discovery findings as a merged set, not an ever-growing list of report occurrences.
    - **Impact:** The main convergence mechanism recreates avoidable review churn and can manufacture blocking coverage failures. This materially impairs the set’s objective of bounded, lower-cost convergence.
    - **Evidence:** In `ai_router/verify_session.py::assemble_cross_round_ledger_with_ids`, every blocking issue in every prior envelope receives a new `L<n>` ID regardless of the computed `settled` state. Prior `fixVerdicts` are not reconciled, so a `fix-accepted` finding remains mandatory in the next cycle. Discovery merging similarly uses `merged_issues.extend(issues_k)` without deduplication. The session’s own records demonstrate the resulting growth: discovery reports 9 blockers for 7 distinct points, and round 4 repeats verdicts for all historical entries after round 3 had already accepted most of them.
    - **Fix:** Assign persistent IDs to logical findings, deduplicate equivalent fan-out reports before creating the merged envelope, and reconcile remediation verdicts into active states. Subsequent remediation reviews should require verdicts only for unresolved/rejected findings and genuinely new in-hunk blockers, while retaining accepted findings as immutable settled history.

#### NITS

- **Nit:** `ai_router/verification.py::parse_fix_verdicts` and `docs/session-issues-schema.md` describe fix verdicts as “observability-only” and claim blocking reads only restated Issue blocks. Current `verify_session.run()` uses parsed verdicts directly to synthesize blockers for `fix-rejected` and incomplete coverage.

- **Nit:** `s2-convergence-replay.md` says `fixVerdicts` were parsed into the “round-3/4 envelopes,” but the clean round 4 has no envelope by design; only its raw verification artifact records the six accepted verdicts.

- **Nit:** “Same-model” discovery is not enforced. The implementation makes repeated router calls with identical arguments but does not pin later calls to the first call’s model, so routing-state or availability changes may select different models.

- **Nit:** The CHANGELOG’s “byte-for-byte” classic compatibility claim is too strong. Routing and prompt behavior remain compatible for normal responses, but dry-run output changed and malformed-token handling now normalizes fail-closed rather than preserving the former token path.