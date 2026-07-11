ISSUES FOUND

### Issue 1: The compatibility matrix omits empty-manifest repositories with stamped sets

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires first-open behavior for “every current repo state,” explicitly including both an **empty manifest** and **module-stamped sets**, with each row test-cited. The matrix covers empty manifest only with no sets or unstamped sets; it has no empty-manifest/stamped-set row.
  - **Impact:** Set 092 can implement or test the wrong diagnostics for this migration state while satisfying every listed matrix row. The distinction is behaviorally significant: an empty valid manifest must not produce `manifest-missing`, while mixed stamped/unstamped work produces fallback groups plus an `unstamped-sets` pseudo warning.
  - **Evidence:** `visibleModules.test.ts` has `present([])` tests only for no sets and unstamped sets. No test exercises `present([])` with stamped sets. The implementation produces two currently undocumented cases:
    - all stamped: fallback groups only;
    - stamped plus unstamped: fallback groups plus pseudo-module with `unstamped-sets`.
  - **Correct answer:** Add matrix rows and named tests for empty manifest with all-stamped sets and with mixed stamped/unstamped sets.

### Issue 2: The legacy-root-plan matrix row incorrectly promises “no warning” for absent or invalid manifests

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The cross-cutting row states: “Legacy root plan exists, every set stamped | Pseudo-module stays visible (empty, `Unassigned`, **no warning**).” That unqualified contract contradicts both the implementation and matrix row 9.
  - **Impact:** Sets 092–094 consume this document as their compatibility contract. Following this row would suppress `manifest-missing` or `manifest-invalid` when a legacy plan keeps the pseudo-module visible, hiding actionable manifest faults.
  - **Evidence:** In `computeVisibleModules`, a visible pseudo-module receives:
    ```ts
    if (classification.kind === "invalid") {
      warning = { code: "manifest-invalid" };
    } else if (classification.kind === "absent" && allSets.length > 0) {
      warning = { code: "manifest-missing" };
    }
    ```
    Therefore, with every set stamped and `legacyRootPlanExists: true`, absent manifests produce `manifest-missing` and invalid manifests produce `manifest-invalid`. The cited test covers only a populated valid manifest.
  - **Correct answer:** Qualify “no warning” to valid manifests, document the absent/invalid overrides, and add tests for legacy-plan visibility under absent and invalid classifications.

#### NITS

- **Nit:** Several alleged verbatim test-name citations use an ellipsis, such as ``Q8 invalid-manifest: …`` and ``declared modules resolve planPath through modulePlanRelPath: …``. They are identifiable prefixes, but they do not satisfy the document’s explicit claim that test names are cited verbatim.