ISSUES FOUND

- **Issue 1:** The cap measurement is not the spec-promised, reproducible four-session measurement.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/121-guidance-becomes-executable/spec.md:489`, `docs/session-sets/121-guidance-becomes-executable/s4-doc-only-cap.md:37`, `docs/session-sets/121-guidance-becomes-executable/s4-doc-only-cap-measurement.json:175`, `ai_router/measure_doc_only_cap.py:166`
  - **Failure scenario:** The set closes with `s4-doc-only-cap.md` as the official “first real measurement,” but Session 4’s own verification traffic is absent. That is probable because the checked-in report explicitly says Session 4 will be appended later, and the raw JSON only contains sessions 1–3. The operator/future triage then relies on an incomplete “across all four sessions” verdict.
  - **Acceptance criterion:** `JUDGMENT - The cap measurement markdown and raw JSON are regenerated from the current measurement module after Session 4 verification is recorded, include Session 1-4 round counts/findings, and the saved raw report matches the module's current output shape.`
  - **Details:** **Violation:** the spec requires “Measure the doc-only cap on this set's own verification traffic … now across all **four** sessions.” **Impact:** this is the session’s central created deliverable; an incomplete measurement changes the merge/close decision because the evidence-backed verdict is not actually backed by all required evidence. **Evidence:** the report admits Session 4 rows are deferred, the JSON has `rounds_per_session` only for `1`, `2`, and `3`, and the saved “raw report” does not match the current module output schema (`roundsPerSession`, `medianRounds`, `preCapMedianRounds`, camelCase counterfactual keys).

**NITS**

- `_round_counts()` counts every non-empty ledger line, so the Session 1 operator-authorization line is counted as a verification round; the median is unchanged here, so this is non-blocking.
- The report says the four only-mixed blocker artifacts were all late remediation-review rounds, but `s2` round 2 and `s3` round 2 are supplementary.
- `classify()` drops non-string `evidencePaths` entries while `is_doc_only_issue()` treats them as non-doc; generated artifacts appear normalized, so this is a low-probability edge case.
- The untracked `tools/dabbler-ai-orchestration/media/ai-work-explorer.png` screenshot is outside Session 4’s declared no-extension-file scope and should not be bundled with this session.