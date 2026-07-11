ISSUES FOUND

- **Issue 1: Manifest-controlled `planPath` can escape the workspace and cause arbitrary file writes**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The implementation describes module plan paths as “repo-relative,” but does not enforce that contract. A manifest value such as `planPath: ../outside.md` is normalized only by trimming and replacing backslashes.
    - **Impact:** When a user imports a plan, the extension can create or overwrite a file outside the workspace. This is a merge-blocking filesystem-safety defect because repository-controlled configuration determines the write destination.
    - **Evidence:** `src/utils/moduleAuthoring.ts` → `modulePlanRelPath()` returns arbitrary `entry.planPath` values without rejecting absolute paths or `..` segments. `src/wizard/planImport.ts` then computes `path.join(root, ...target.destPosix.split("/"))`, creates its parent directory, and calls `fs.copyFileSync()` on that escaped path. No containment check occurs before the write.
    - **Correct answer:** Validate `planPath` while reading/classifying the manifest and again before filesystem access. Reject absolute, drive-qualified, and traversal paths; resolve the destination and require `path.relative(root, destination)` to remain inside the workspace. Add import and decomposition tests for `../`, absolute paths, and mixed-separator traversal.

## NITS

- **Nit:** The UAT checklist repeatedly says the button label is exactly `New module...`, while `gettingStartedHtml.js` renders `New module…` with a Unicode ellipsis. Align the literal checklist expectation with the UI.