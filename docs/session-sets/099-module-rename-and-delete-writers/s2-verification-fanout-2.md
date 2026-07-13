ISSUES FOUND

- **Issue 1: Watcher inventory line numbers are off by one and will fail the full suite**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** CI or the required full-suite run executes `watcherInventory.test.ts` and deterministically reports both watcher callsites as unexpected because the allowlist points one line below their actual locations. This is probable because the mismatch occurs on every test run, not only under an unusual runtime condition.
  - **Details:**
    - **Violation:** Step 6 requires “Build + full suite” and the session progress requires `suite-green`.
    - **Impact:** The required suite cannot be green, so this changes a reasonable reviewer’s merge decision.
    - **Evidence:** The baseline allowlist locations were lines 205 and 241. The only new source line before those callsites is the single `deleteModule` import, so they move to 206 and 242. The three-line registration added around new line 323 occurs after both watcher callsites and cannot move them. The test instead changes the expected lines to 207 and 243 and incorrectly claims the later registration shifted them.
  - **Location:** `tools/dabbler-ai-orchestration/src/test/suite/watcherInventory.test.ts`, entries changed to lines `207` and `243`.
  - **Fix:** Change the allowlist locations to `206` and `242`, then run the watcher inventory and full suite.

- **Issue 2: The destructive command implements only one modal confirmation, not the required two-step confirmation**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every user invoking `dabbler.deleteModule` receives only one modal warning after selecting a module. The mandated second safety checkpoint is absent on the main path, allowing permanent scaffold deletion after a single modal acceptance. This is certain for every successful invocation and materially removes an explicit safeguard for a destructive operation.
  - **Details:**
    - **Violation:** The specification requires “module QuickPick → **two-step modal confirm**” and the end deliverables require palette commands “with **two-step truthful confirms**.”
    - **Impact:** The primary destructive workflow does not meet its required safety contract, which should block merging the feature as complete.
    - **Evidence:** `runDeleteModuleFlow` calls `ui.confirm(...)` exactly once. `defaultUi.confirm` presents exactly one `showWarningMessage`. The tests likewise model and test only a single confirmation.
  - **Location:** `tools/dabbler-ai-orchestration/src/commands/deleteModule.ts`, `runDeleteModuleFlow` and `defaultUi`; `src/test/suite/deleteModule.test.ts`.
  - **Fix:** Implement two sequential modal confirmations, aborting if either is declined. Ensure the final confirmation presents the exact disposition, and add tests for accepting both and declining each independently.

#### NITS

- **Nit:** The confirmation is predictably untruthful when an affected set is currently running. `classifyModuleSetsForDeletion` labels an in-progress set `cancel`, so the dialog says it will be cancelled; `deleteModule` subsequently refuses the entire operation. Preflight running sessions before displaying the destructive confirmation, or represent the blocked disposition in the UI.

- **Nit:** The claim that sharing the classifier “guarantees” the confirmation matches the writer is false under concurrent changes. The command classifies before awaiting the modal, while the writer independently reclassifies afterward. A newly created or changed set can therefore be cancelled without appearing in the accepted enumeration. Compare a snapshot immediately before apply and require reconfirmation if it changed.

- **Nit:** Scaffold removal fails open on unknown or malformed state. `rawSessionSetStatus` converts unreadable JSON, missing status, and every unrecognized status to `"not-started"`. A `kind: plan|decomposition` directory can consequently be removed outright without positive proof that it was unstarted. Unknown state should classify as `cancel` or refusal, not removal.

- **Nit:** `EXECUTION_ARTIFACT_FILENAMES` is not exhaustive despite enforcing the “no execution artifacts” condition. Canonical artifacts such as `*-uat-checklist.json`, verification/issues/remediation records, and other session evidence are omitted. Prefer a positive pristine-scaffold definition—only known scaffold files may exist—rather than a partial artifact denylist.

- **Nit:** Manifest failure handling does not ensure the manifest remains intact. `io.writeFileSync(manifestAbs, manifestNext)` has no atomic temp-file replacement or rollback; an implementation that truncates or partially writes before throwing leaves a corrupted or partly edited manifest despite the stated posture that a failed run leaves the module declared. Use atomic write-and-rename or restore the original after a failed write.

- **Nit:** `removeManifestEntryText` deletes comments and blank lines between the removed entry and the next sibling because its boundary scan skips comment lines. A comment intended to document the following entry is lost, weakening the claimed format preservation. Preserve inter-entry comments unless they are demonstrably part of the deleted block.

- **Nit:** The emergent-restore test does not verify that history actually reappears in module grouping. It only calls `classifyModuleSetsForDeletion`, which proves the raw stamp remains discoverable by the delete classifier. Exercise the module-tree/grouping reader after re-declaration to test the user-visible restore property.