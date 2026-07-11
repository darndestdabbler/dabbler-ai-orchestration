ISSUES FOUND

- **Issue 1: Explicit YAML null values are silently classified as valid-empty but cannot be grown by the appender**
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `src/utils/fileSystem.ts` → `readModulesManifest`; `src/utils/moduleAuthoring.ts` → `EMPTY_MODULES_LINE_RE`, `scaffoldNewModule`
  - **Details:**
    - **Violation:** The contract requires valid empty manifests to work through the New Module flow: “the appender grows an empty manifest into its first block-style entry,” while genuinely malformed manifests must abort as invalid. The implementation instead creates an inconsistent third state: explicit YAML null is accepted as valid-empty but is not appendable.
    - **Impact:** A repository containing `modules: null` or `modules: ~` is silently treated as having a valid empty manifest by all reader/classifier consumers, but `scaffoldNewModule` fails rather than adding the first module. This breaks the session’s central reader/writer compatibility guarantee and should block merge.
    - **Evidence:** YAML parses bare `modules:`, `modules: null`, and `modules: ~` to the same JavaScript `null`. Consequently, `if (rawModules === null) return [];` accepts all of them, and `classifyModulesManifest` returns `{ kind: "present", entries: [] }`. However, `EMPTY_MODULES_LINE_RE` matches only bare `modules:` and same-line `modules: [ ]`. For `modules: null`, replacement returns no candidates and the fallback creates:
      ```yaml
      modules: null
        - slug: clock
      ```
      The parse-after-append guard rejects this, so the accepted manifest cannot be grown.
    - **Fix:** Make the accepted and appendable domains consistent. Either reject explicit null spellings while specially recognizing only a genuinely bare `modules:` declaration, or support all YAML null spellings accepted by the reader in `replaceEmptyModulesList`. Add classification and end-to-end scaffold tests for at least `modules: null` and `modules: ~`.