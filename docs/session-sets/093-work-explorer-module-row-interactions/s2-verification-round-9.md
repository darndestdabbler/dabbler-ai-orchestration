ISSUES FOUND

- **Issue 1: Post-write anomalies are not rolled back as required**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The authoritative D4 contract requires a two-phase writer with a “parse-after guard + rollback” and specifically “single-file rollback-from-in-memory-original + batch abort on any post-write anomaly.”
    - **Impact:** If the write produces unexpected or corrupt bytes, the operation aborts but can leave the operator’s `spec.md` modified and requiring manual repair. This fails the promised mutation-safety contract and should block merge.
    - **Evidence:** The post-write verification catch explicitly leaves the file unchanged rather than rolling it back:
      ```ts
      // NEVER overwrite ... Leave the file as-is
      return fail(..., true);
      ```
      This is not merely a reporting difference; the required rollback is absent. The implementation’s comments and R7 remediation acknowledge the deviation.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → post-write verification catch in `assignLegacySetsToModule()`
  - **Fix:** Implement a write strategy that can satisfy both rollback and concurrent-edit preservation, such as atomic temporary-file replacement plus an ownership/version check and conditional restore. At minimum, roll back when the current bytes are provably extension-owned; unknown concurrent bytes must not be overwritten.

- **Issue 2: Existing-module detection mistakes nested YAML or literal text for a top-level assignment**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** D4’s same-target no-op applies to a set already stamped with the target module, meaning the configuration mapping’s top-level `module` property. The writer must otherwise insert that property and verify the parsed mapping.
    - **Impact:** A valid unstamped configuration can be falsely reported as already assigned and remain unstamped. For example:
      ```yaml
      notes: |
        module: greeter
      ```
      causes assignment to `greeter` to return `noop`, although YAML parsing yields no top-level `module`. A nested mapping has the same problem.
    - **Evidence:** Existing-module detection permits arbitrary indentation:
      ```ts
      /^[ \t]*module[ \t]*: ...$/m
      ```
      `stampModuleIntoSpecText()` returns `noop` immediately when that textual value equals the target, without parsing and confirming `doc.module === slug`.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → `CONFIG_MODULE_LINE_RE` and `stampModuleIntoSpecText()`
  - **Fix:** Determine existing assignment from the parsed configuration mapping’s own top-level `module` property, while retaining raw-text checks for duplicate keys and format preservation. Do not treat indented nested keys or block-scalar contents as module stamps. Add regressions for both cases.

- **Issue 3: Palette `Open Plan` can re-pick and import into a different module**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The required targeting parity says palette and row/context actions resolve the same module semantics, with the palette selecting its module through QuickPick.
    - **Impact:** When the selected module’s plan is missing and the operator accepts “Import one first?”, a second module QuickPick appears. Selecting a different entry imports the plan into a module other than the one named by the warning and original `Open Plan` action, creating a wrong-destination write.
    - **Evidence:** `openModulePlan()` first resolves `target`, but its missing-plan branch discards that resolution:
      ```ts
      if (action === "Import Plan") await importPlanFromFile(ui, opts);
      ```
      On a palette invocation, `opts` is `undefined`, so `importPlanFromFile()` calls `pickModuleForAuthoring()` again rather than carrying `target.entry`.
  - **Location:** `tools/dabbler-ai-orchestration/src/wizard/planImport.ts` → missing-plan branch of `openModulePlan()`
  - **Fix:** Pass the already resolved target into the import path, for example `{ preselectedSlug: target.entry?.slug ?? "" }`, so the palette performs one module selection and the follow-up import targets that same module. Add a missing-plan palette regression asserting only one module QuickPick and the correct destination.