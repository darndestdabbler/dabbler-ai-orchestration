ISSUES FOUND

- **Issue 1: A malformed existing module manifest silently disables module targeting**
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `src/utils/moduleAuthoring.ts` → `resolveModuleTarget()` / `pickModuleForAuthoring()`; propagated into `src/wizard/planImport.ts` and `src/wizard/sessionGenPrompt.ts`
  - **Details:**
    - **Violation:** The task requires module-targeted authoring to “read `docs/modules.yaml`, ask which module … and write `module: <slug>` … validated against the manifest.” The response also claims only **no manifest** preserves the repo-level flow. Instead, an existing invalid manifest is treated identically to an absent manifest.
    - **Impact:** A user with a malformed `docs/modules.yaml` receives no error or picker. Planning prompt/import silently targets `docs/planning/project-plan.md`, and decomposition silently generates an unstamped repo-level prompt. This can write a plan to the wrong destination and produce ungrouped session sets in a module-organized repository.
    - **Evidence:** `scaffoldNewModule()` explicitly recognizes `fs.existsSync(manifestAbs) && existing === null` as an invalid present manifest. But `pickModuleForAuthoring()` passes `readModulesManifest(root)` directly to `resolveModuleTarget()`, where `null` returns `{ kind: "none" }`. All three authoring flows then use their repo-level fallback.
  - **Fix:** Distinguish absent, valid, and invalid manifests. If `docs/modules.yaml` exists but cannot be parsed as a valid manifest, show an error and cancel the authoring flow rather than returning `none`. Add malformed-present-manifest tests for the picker, planning prompt/import, and decomposition flow.

## NITS

- **Nit:** The UAT checklist says the button is labeled exactly `New module...`, but `gettingStartedHtml.js` renders `New module…` with a Unicode ellipsis. Align the checklist literal or the rendered label.