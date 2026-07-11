ISSUES FOUND

- **Issue 1: The appender can replace a nested `modules:` key instead of the valid root manifest key**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The required contract says “the appender grows an empty manifest into its first block-style entry.” The implementation comment also claims a nested match is “unreachable corruption” because classification rejects it.
    - **Impact:** A valid empty manifest containing an earlier nested `modules:` property cannot be extended. `scaffoldNewModule` fails and may leave the intentionally written-first orphan plan stub, blocking the New Module flow for an otherwise valid manifest.
    - **Evidence:** `EMPTY_MODULES_LINE_RE` accepts any indentation, and `replaceEmptyModulesList` uses only the first `exec` match. For example:
      ```yaml
      metadata:
        modules: []
      modules: []
      ```
      `readModulesManifest` reads the root `modules` as `[]`, so classification returns `{ kind: "present", entries: [] }`. Replacement instead modifies `metadata.modules`, leaving the root list empty. The parse-after-append guard then sees that the root list did not gain the expected entry and refuses the operation. Extra root or nested metadata is not prohibited, and the tests already establish that additional keys are supported.
    - **Correct answer:** Locate the actual root-level `modules` declaration rather than taking the first textual match. If retaining textual replacement, evaluate matching candidates without writing and select the one whose parsed root `modules` list gains exactly the expected entry. Add end-to-end tests with an earlier nested `modules:` key for both root `modules: []` and bare `modules:`.