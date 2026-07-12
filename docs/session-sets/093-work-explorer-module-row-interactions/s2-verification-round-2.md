ISSUES FOUND

- **Issue 1: The stamp writer can accept an unterminated configuration fence by borrowing a closing fence from a later section**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The D4 contract requires malformed or unfenced configuration blocks to “refuse loud,” leaving all files untouched.
    - **Impact:** A malformed `Session Set Configuration` section can be modified instead of rejected. This breaks the safety guarantee for code that mutates operator-owned `spec.md` files and would block merge.
    - **Evidence:** In both `stampModuleIntoSpecText()` and `extractConfigBlock()`, `sectionEnd` is calculated, but the closing-fence search is performed against the remainder of the entire document:
      ```ts
      const afterOpen = text.slice(blockContentStart);
      const closeRel = afterOpen.search(CONFIG_FENCE_CLOSE_RE);
      ```
      Thus this malformed document is accepted:
      ```md
      ## Session Set Configuration
      ```yaml
      tier: full
      ## Sessions
      ```
      ```
      The later fence is treated as the configuration fence. `## Sessions` is a YAML comment, so the parse-after guard can still pass and the file is written.
    - **Location:** `src/utils/moduleAuthoring.ts` → `stampModuleIntoSpecText()` and `extractConfigBlock()`
    - **Fix:** Search for the closing fence only between `blockContentStart` and `sectionEnd`, and refuse if none exists within that bounded section. Add a regression test with an unclosed YAML fence followed by a closing fence in a later section.

- **Issue 2: `Open Plan` has no Command Palette mirror**
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The shipped contract requires a “Context-menu + Command-Palette mirror of the same actions,” including `Open Plan`.
    - **Impact:** Operators cannot invoke the new module-aware `Open Plan` action from the Command Palette, so a required access path is missing.
    - **Evidence:** `openModulePlan()` is newly introduced, but its only new caller is `CustomSessionSetsView.handleModuleAction()`, which serves row and context-menu actions. `registerPlanImportCommand()` is unchanged, and `package.json` adds only `dabbler.assignLegacySetsToModule`; no contributed or registered palette command is wired to `openModulePlan()`.
    - **Location:** `src/wizard/planImport.ts`, `src/providers/CustomSessionSetsView.ts`, and `package.json`
    - **Fix:** Wire `openModulePlan()` into the required Command Palette surface—either through a contributed command or the existing palette action chooser—while retaining the palette module QuickPick behavior. Add a test proving the palette path resolves the selected module and invokes the open action.