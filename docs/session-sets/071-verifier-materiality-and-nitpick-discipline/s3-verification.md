## ISSUES FOUND

- **Issue 1:** No session-verification verdict or findings output
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** Start of the response; entire response structure
  - **Fix:** Replace the prompt/evidence dump with an actual verifier result that starts with the required binary verdict token and, if applicable, structured issues.
  - **Details:**  
    **Violation:** The task’s contract says the verdict grammar stays **binary** — “**VERIFIED / ISSUES_FOUND**” — and the verifier is supposed to return a review result, not source material.  
    **Impact:** This output is unusable as a session-verification artifact: no one can tell whether S3 passed review, what blocked it, or feed the result to any parser/workflow expecting a verification verdict. That would change a reasonable merge/close decision because the verification step effectively did not happen.  
    **Evidence:** The response begins with `# Set 071 S3 — changes under review` and then dumps the staged diff and full file contents. It never emits `VERIFIED` or `ISSUES_FOUND`, never lists findings, and never provides a review conclusion.  
    **Correct answer:** An actual verification result using the required binary verdict grammar.

- **Issue 2:** The response does not perform the requested review at all
  - **Category:** Completeness
  - **Severity:** Major
  - **Location:** Entire response body
  - **Fix:** Evaluate the scoped S3 claims against the supplied evidence and report whether each is accurate, then conclude with the appropriate verdict.
  - **Details:**  
    **Violation:** The task explicitly scoped six checks: accuracy of `docs/verification-surface-strategy.md` §7 and §3 xref, the new `pull-verifier.md` section, lesson `L-071-1`, the `[0.25.0]` and backfilled `[0.24.0]` changelog entries, the set-level `change-log.md`, and version bump consistency.  
    **Impact:** The response provides zero assurance on the only thing S3 was supposed to be judged on: whether the documentation/release synthesis is accurate against the already-shipped S1/S2 code. A reviewer cannot rely on this to merge or close the set.  
    **Evidence:** The body is a reproduction of the evidence bundle itself — diff plus full file contents — with no analysis of any scoped item, no statement that any claim is accurate/inaccurate, and no comparison against shipped S1/S2 behavior.  
    **Correct answer:** A substantive review of those scoped items, with any material inaccuracies called out and an overall verdict.