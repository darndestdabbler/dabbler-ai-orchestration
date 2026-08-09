**ISSUES FOUND**

- Fix verdict: L1 TypeScript optional/read/type/value forms -- fix-accepted
- Fix verdict: L2 Python non-docstring triple-quoted templates -- fix-accepted
- Fix verdict: L3 canonical Layer 2 run-of-record command -- fix-accepted
- Fix verdict: L4 router live-version release-status row -- fix-accepted
- Fix verdict: L5 common declaration forms from round 1 -- fix-accepted
- Fix verdict: L6 live `.template` scaffold sources -- fix-accepted
- Fix verdict: L7 TypeScript destructuring and bracket reads -- fix-accepted

- **Issue 1:** The remediated guard still misses ordinary live declaration forms.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A future extension helper or scaffold source adds a normal TypeScript object literal such as `const spec = { tier: "lightweight", requiresUAT: false };`, or Python/TS code reintroduces the normalized `verification_mode` field through an attribute/destructured read. Those are standard config/object shapes in this repo’s TypeScript/Python surfaces, so this is probable over the life of the CI gate. The guard exits 0, so the removed tier/field can silently re-enter despite the anti-resurrection deliverable.
  - **Acceptance criterion:** JUDGMENT - The guard reports `tier-declared` for unquoted inline object-literal tier declarations such as `const spec = { tier: "lightweight" }`, and reports `verification-mode-field` for snake_case property reads/destructuring such as `spec.verification_mode` and `const { verification_mode } = spec`, while the existing inert-string/test-fixture exclusions still pass.
  - **Details:** Violation: the spec requires “a script/test asserting zero live references to `tier: lightweight`, `verificationMode`, or either mode outside archives,” and the guard’s own contract says declaration territory includes “code outside comments/docstrings.” Impact: the CI-wired executable proof remains false for common code declarations, so a reasonable reviewer should not accept the gate as proving the tier cannot resurrect silently. Evidence: `TIER_DECLARATION_INLINE` only matches quoted keys (`["']tier["']...`), so a probed `const spec = { tier: "lightweight", requiresUAT: false };` returned `[]`; the field regex’s dotted/destructuring branches use `verification[_M]ode`, so probed `spec.verification_mode` and `const { verification_mode } = spec` also returned `[]`. The correct behavior is to catch those declaration-territory forms.