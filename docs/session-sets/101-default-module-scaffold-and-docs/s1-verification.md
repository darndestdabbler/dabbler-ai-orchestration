ISSUES FOUND

- **Issue 1:** Existing repositories with session sets but no modules manifest are incorrectly seeded with the Default module.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical legacy user has existing `docs/session-sets/*` content created before `docs/modules.yaml` existed and reruns **Build project structure** after upgrading. Build creates the missing manifest, treats that creation as proof of a fresh repository, and adds `default` plus two new lifecycle sets. This is probable for the exact upgrade/rerun population covered by the explicit compatibility requirement and materially changes their manifest, pending work, numbering, and Work Explorer organization.
  - **Details:**
    - **Violation:** The requirement says, “re-running Build on a repo that already has modules or sets makes no module/set writes (skip-existing posture throughout).”
    - **Impact:** Existing repositories receive an unsolicited module and two pending sets. Adding a real manifest can also replace legacy pseudo-Default presentation with a declared Default containing only the newly generated sets, disrupting the existing tree and workflow. This should block merging because the implementation violates a named migration/idempotency contract.
    - **Evidence:** In `buildProjectStructureNoPrompt`, the only gate is:
      ```ts
      result.written.includes(MODULES_MANIFEST_DISPLAY)
      ```
      There is no pre-Build check for existing `docs/session-sets`, module directories, or other pre-existing lifecycle content. Therefore any repository with sets but no manifest passes the gate after `ensureModulesManifest` creates the manifest. The tests cover only a pre-existing manifest, not existing sets without one.
    - **Fix:** Capture repository state before scaffolding and seed Default only when this is genuinely a fresh repository: no pre-existing modules manifest, declared/module artifacts, or session sets. Add Full and Lightweight tests where sets exist but `docs/modules.yaml` does not, asserting that no Default entry or lifecycle sets are created.

## NITS

- **Nit:** The required tree-level acceptance tests are missing.  
  **Location:** `gitScaffoldDefaultModule.test.ts`.  
  **Fix:** Exercise the actual Work Explorer/tree provider and assert that a fresh scaffold shows one declared module, two pending sets, and no pseudo-module; also assert that an empty pre-existing `modules: []` legacy repository still renders pseudo-Default exactly as before. Current tests inspect files and seam calls only, do not assert pending state, and use synthetic tier results rather than validating the complete end state in both tiers.

- **Nit:** The recorded dogfood does not satisfy the specified locally built VSIX walkthrough.  
  **Location:** `s1-dogfood.md`.  
  **Fix:** Run Build, rename, delete, and re-add through the packaged VSIX and registered interactive commands. The artifact explicitly says it invoked `out` JavaScript and writer functions directly, bypassing the VSIX bundle, command registration, webview/input flows, and dialogs. Calling interactive UAT “optional” conflicts with the session’s required live dogfood step.

- **Nit:** Default scaffolding failures are swallowed after potentially leaving an unrecoverable partial scaffold.  
  **Location:** `scaffoldDefaultModuleAndLifecycleSets` and its caller in `buildProjectStructureNoPrompt`.  
  **Fix:** Either make the operation transactional/retryable or surface a Build failure with actionable recovery. If `scaffoldNewModule` succeeds but lifecycle scaffolding fails, the manifest now exists; the next Build skips the helper permanently because the manifest is no longer in `written`. The current successful Build flow can therefore leave a module without its required sets.

- **Nit:** Build’s write count and returned `ScaffoldResult` omit the Default module, plan stub, and lifecycle-set writes.  
  **Location:** Summary construction after `scaffoldDefaultModuleAndLifecycleSets`.  
  **Fix:** Merge the helper’s created/skipped paths into the result or use wording that does not claim a complete file-write count. The dogfood itself reports “13 file(s) written” despite additional files being written afterward.

- **Nit:** The `ran` API documentation contradicts implemented behavior.  
  **Location:** `DefaultModuleScaffoldOutcome.ran`.  
  **Fix:** Remove “or already existed identically” or make identical existing state return `ran: true`; the direct rerun test establishes that an existing identical Default returns `ran: false`.