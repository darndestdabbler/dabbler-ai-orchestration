## ISSUES FOUND

- **Issue 1:** The response does not produce the required session-verification verdict
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** Entire response, especially the opening section
  - **Fix:** Return an actual verification result that begins with the required verdict token and, if applicable, blocking findings.
  - **Details:**  
    **Violation:** The task explicitly says: *“check whether the documentation … accurately describe the already-shipped S1/S2 code, then YOU emit the verdict (VERIFIED if the synthesis is accurate; ISSUES_FOUND with findings if a claim is materially wrong).”*  
    **Impact:** This is not a usable session-verification artifact. A reviewer or any downstream workflow cannot tell whether S3 passed, failed, or why. That changes the merge/close decision because the verification step was effectively not performed.  
    **Evidence:** The response starts with `# Set 071 S3 -- work product under review` and then reproduces the staged diff and file contents. It never emits a review verdict of its own.  
    **Correct answer:** A real verification verdict over the supplied evidence, not a replay of the evidence bundle itself.

- **Issue 2:** The response does not perform the scoped review the task asked for
  - **Category:** Completeness
  - **Severity:** Major
  - **Location:** Entire response body
  - **Fix:** Evaluate the six scoped checks against the supplied evidence and state whether each is accurate, then conclude with the overall verdict.
  - **Details:**  
    **Violation:** The task defines a concrete review scope: `docs/verification-surface-strategy.md` §7 and §3 xref, `ai_router/docs/pull-verifier.md`, lesson `L-071-1`, `ai_router/CHANGELOG.md` `[0.25.0]` and backfilled `[0.24.0]`, set-level `change-log.md`, and version bump consistency.  
    **Impact:** The output provides no assurance on the only material question in S3: whether the synthesis docs and release-staging text accurately describe the already-shipped S1/S2 code. A reasonable reviewer could not rely on this to merge or close the set.  
    **Evidence:** The body contains no comparison of any scoped claim to ground truth, no adjudication of accuracy/inaccuracy, and no conclusion on version-bump consistency. It is just the evidence package restated.  
    **Correct answer:** A substantive review of those scoped items, with any material inaccuracies identified and an overall verdict.