ISSUES FOUND

- **Issue 1: A valid blocking verdict with unparseable findings leaves the phased loop unable to continue**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A discovery verifier returns the valid `ISSUES FOUND` token but formats its findings as prose or otherwise drifts from the parser’s Issue-block grammar. This is a probable LLM failure mode during the deliberately long, exhaustive fan-out responses. The CLI classifies the round as blocking but writes no issues envelope or discovery baseline; the exact supplementary command it prints then refuses because no prior findings envelope exists, and remediation-review also refuses because no baseline exists.
  - **Details:**
    - **Violation:** The phased contract requires blocking discovery to seed the supplementary pass, merged remediation plan, and later fix-delta baseline.
    - **Impact:** A typical formatting deviation can dead-end the mandatory loop or silently omit malformed blockers from a partially parsed merged envelope, materially defeating exhaustive discovery and preventing remediation review.
    - **Evidence:** In `ai_router/verify_session.py`, the merged verdict becomes `ISSUES_FOUND` whenever any call returns that token, but `write_issues_artifact(...)` runs only under `if merged_issues:`. Both `assemble_prior_findings_block()` and `find_discovery_baseline_tree()` subsequently require that omitted envelope. There is no validation that an `ISSUES_FOUND` response produced at least one parsed issue, and no test covers this mismatch.
    - **Fix:** Treat `ISSUES_FOUND` with zero parsed issues as invalid evidence and fail closed with a fresh-round instruction, or persist a schema-valid unknown-severity placeholder plus the discovery baseline. Add response-shape validation so partially malformed blocking lists cannot silently disappear from the merged ledger.

#### NITS

- **Nit:** Discovery does not actually merge findings at every severity into its envelope or CLI counts. `parse_nits()` exists but `run()` only calls `parse_verification_response()`; the replay’s raw discovery outputs contain NITS that are absent from `s2-replay-findings-round-1.json`. The raw artifacts preserve them, but the CHANGELOG’s “finding sets merge into ONE round envelope” wording is broader than the implementation.