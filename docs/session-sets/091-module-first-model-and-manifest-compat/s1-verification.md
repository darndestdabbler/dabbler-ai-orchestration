ISSUES FOUND

- **Issue 1: The appender rejects valid root-indented empty manifests while the reader classifies them as valid-empty**
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `moduleAuthoring.ts` → `EMPTY_MODULES_LINE_RE`, `replaceEmptyModulesList`; `moduleAuthoring.test.ts` explicitly expects `"  modules: []"` not to match.
  - **Details:**
    - **Violation:** The contract says the appender “replaces EITHER empty form” and the session ends with “the appender grows an empty manifest into its first block-style entry.” Column-zero formatting is not part of that contract.
    - **Impact:** A valid YAML manifest such as `"  modules: []\n"` is read as `{ kind: "present", entries: [] }`, but `scaffoldNewModule` cannot grow it. The replacement returns `null`, fallback appending produces an invalid mapping/sequence combination, and the parse guard refuses the New Module operation. This breaks the session’s central empty-manifest compatibility promise for plausible operator formatting and should be fixed before merge.
    - **Evidence:** YAML permits indentation at the document root, so `yaml.load("  modules: []\n")` yields a mapping with `modules: []`; `readModulesManifest` therefore accepts it. However, `EMPTY_MODULES_LINE_RE` begins with `^modules:`, and the new test explicitly asserts `replaceEmptyModulesList("  modules: []\n", block) === null`, incorrectly equating column zero with top-level YAML.
    - **Fix:** Recognize root-level `modules` independently of column-zero formatting and preserve its indentation when rendering the first entry. Add an end-to-end classification-and-append test for a root-indented `modules: []` and bare `modules:` manifest.