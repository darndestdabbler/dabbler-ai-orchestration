ISSUES FOUND

### Issue 1: `computeVisibleModules` is not pure for unsafe declared plan paths

- **Category:** Correctness
- **Severity:** Major
- **Location:** `tools/dabbler-ai-orchestration/src/providers/SessionSetsModel.ts`, declared-module mapping via `modulePlanRelPath(entry)`
- **Details:**
  - **Violation:** The required deliverable is a “**pure, exported**” `computeVisibleModules`. It calls `modulePlanRelPath(entry)`, whose behavior is explicitly documented in the compatibility matrix and test name as “unsafe degrades **with a console warning**.” Console logging is an observable side effect, so the computation is not pure for an unsafe `planPath`.
  - **Impact:** Once Set 092 invokes this model during rendering or refreshes, each recomputation of a manifest containing an unsafe plan path can emit another warning. That violates the side-effect-free model contract and can repeatedly pollute extension output. This foundational API should be corrected before downstream code adopts it.
  - **Evidence:** The declared-module branch executes:
    ```ts
    planPath: modulePlanRelPath(entry),
    ```
    while `work-explorer-compat-matrix.md` states “unsafe degrades with a console warning,” and the corresponding test is named:
    ```ts
    declared modules resolve planPath through modulePlanRelPath: explicit value kept, absent defaults, unsafe degrades
    ```
- **Fix:** Separate pure path resolution from warning emission. Have `computeVisibleModules` call a no-log resolver that returns the safe/default path, and emit any operator diagnostic at an outer boundary or through returned structured data. Add a test that spies on `console.warn` and proves `computeVisibleModules` produces no side effects for an unsafe `planPath`.

#### NITS

- **Nit:** The compatibility matrix claims test names are cited verbatim, but several citations use ellipses or suite-level labels rather than existing complete names, including `Q8 no-manifest-stamped-sets: …`, `Q8 invalid-manifest: …`, and `declared modules resolve planPath through modulePlanRelPath: …`.
