ISSUES FOUND

- Fix verdict: L1 TypeScript `verificationMode` resurrection shapes -- fix-rejected
- Fix verdict: L2 Python non-docstring triple-quoted templates -- fix-accepted
- Fix verdict: L3 canonical Layer 2 run-of-record command -- fix-accepted
- Fix verdict: L4 router live release-status row -- fix-accepted
- Fix verdict: L5 -- duplicate-of L1
- Fix verdict: L6 live `.template` scaffold scanning -- fix-accepted

- **Issue 1:** The guard still misses common TypeScript live reads of `verificationMode`.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A future extension change reintroduces the removed field via normal TS config/object access such as `const { verificationMode } = spec;` or `spec["verificationMode"]`. This is probable because this codebase commonly uses both destructuring and bracket access for object/config fields, and these are ordinary ways to read an optional JSON/config field. CI still exits 0, so the anti-resurrection gate does not enforce the promised “zero live references” invariant.
  - **Acceptance criterion:** JUDGMENT - The guard reports `verification-mode-field` for TypeScript shorthand destructuring of `verificationMode` and bracket property reads like `spec["verificationMode"]`, while preserving the intentional stale-marker test allowance.
  - **Details:** Violation: the plan requires a CI-wired gate asserting zero live references to `verificationMode`, and the fix claims property reads are covered. Impact: a reasonable reviewer cannot accept the anti-resurrection proof while common live field reads still pass. Evidence: `VERIFICATION_MODE_FIELD` only catches colon/equals forms, `.verificationMode`, and `VerificationMode`; a probe file containing `const { verificationMode } = spec;` made `ai_router/scripts/lightweight_resurrection_guard.py --repo-root <tmp>` print `[ok] lightweight-resurrection guard: the tier stays removed.` with exit 0.