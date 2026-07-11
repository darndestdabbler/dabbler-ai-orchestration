ISSUES FOUND

### Issue 1: The invalid-manifest matrix row contradicts the implemented pseudo-module predicate and omits the fully stamped case

- **Category:** Correctness / Completeness
- **Severity:** Major
- **Location:** `docs/planning/work-explorer-compat-matrix.md`, row 9; `visibleModules.test.ts`, invalid-manifest tests
- **Details:**
  - **Violation:** The required matrix must cover “every current repo state,” while the settled rule says the pseudo-module appears only when unstamped sets exist, the legacy plan exists, or no other group is visible. Row 9 instead states broadly: “Fallback grouping from observed stamps **plus pseudo-module** with `manifest-invalid` warning.”
  - **Impact:** Sets 092–094 consume this document as their compatibility checklist. Following row 9 would incorrectly render a pseudo-module for an invalid manifest containing only stamped sets, contrary to `computeVisibleModules`. The renderer and its row-level tests could therefore implement the wrong migration behavior.
  - **Evidence:** `computeVisibleModules` sets `pseudoVisible` to:
    ```ts
    unstamped.length > 0 || opts.legacyRootPlanExists || !otherGroupsVisible
    ```
    Thus an invalid manifest with stamped sets, no unstamped sets, and no legacy plan returns fallback groups only. The document itself later acknowledges “invalid manifest over fully-stamped sets” as a case where the pseudo-module is hidden. Existing invalid-manifest tests cover mixed stamped/unstamped sets and no sets, but not the fully stamped case.
- **Fix:** Qualify row 9 with the settled presence predicate and classification-level warning behavior. Add a named test for invalid manifest + all stamped sets + no legacy plan, asserting fallback groups only and no pseudo-module.

### Issue 2: The claimed never-persist guard is not proven across all writer paths

- **Category:** Completeness / False Positive
- **Severity:** Major
- **Location:** `visibleModules.test.ts`, suite `Set 091 S2 — never-persist module: default guard`; corresponding claims in the compatibility matrix and activity log
- **Details:**
  - **Violation:** The contract says sets authored under the pseudo-module carry “no `module:` field” and requires every writer path to be audited and test-pinned. The recorded Q6 ruling additionally requires pseudo and declared-`default` cases for all three writer paths.
  - **Impact:** A writer could start emitting `module: Unassigned`, another synthesized value, or otherwise adding a `module:` field for pseudo-module authoring while the current tests remain green. That would corrupt the unstamped-set invariant and cause such sets to reappear as undeclared fallback groups. The missing positive cases also fail to prove that literal `default` is emitted only for a declared module.
  - **Evidence:** Only the bootstrap test rejects every `module:` line:
    ```ts
    assert.ok(!/^module:/m.test(spec))
    ```
    The session-generation pseudo test checks only:
    ```ts
    assert.ok(!prompt.includes("module: default"))
    ```
    and the planning pseudo test likewise checks only `module: default` and `modules.yaml`. Both would pass if another module stamp were emitted. The declared literal-`default` case is tested only by directly passing `"default"` to `bootstrapCtx`; session generation uses `greeter`, and plan import has no declared-`default` case. Directly supplying `"default"` also does not establish that it came from a manifest declaration, despite the response claiming “only a picked manifest entry is ever stamped.”
- **Fix:** For bootstrap, session generation, and plan import, add pseudo-target tests that reject any generated `module:` stamp or instruction. Add declared literal-`default` tests for all three paths, preferably integration tests coupling `pickModuleForAuthoring` or a typed declared-entry target to each writer so provenance is enforced rather than assumed.