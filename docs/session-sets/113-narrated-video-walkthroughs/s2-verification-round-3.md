ISSUES FOUND

Fix verdict: L1 The exemplar now declares the required clone and repository-root context -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 The CSS-ID rule still misses common type-qualified selectors -- fix-rejected

- **Issue 1:** The remediated CSS-ID quarantine rule misses selectors such as `button#save`
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/scenario_lint.py, ai_router/tests/test_scenario_lint.py`
  - **Failure scenario:** A web-scenario author pastes a common type-qualified selector such as `button#save` into an `action`. This form survives an unquoted YAML scalar because there is no whitespace before `#`. The negative lookbehind rejects the match because `#` follows the word character `n`, so lint and the corpus test remain clean while all generated documents publish target-specific mechanics. Type-qualified ID selectors are common outputs from browser tooling, making this a probable authoring path rather than an exotic edge case.
  - **Acceptance criterion:** `python -c "__import__('sys').exit(not any(r.name == 'css-id-selector' and r.pattern.search('Click button#save.') for r in (__import__('sys').path.insert(0, 'ai_router') or __import__('scenario_lint')).RULES))"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** The contract requires that “Playwright selectors and any other target-specific mechanics live in platform-specific blocks, never in the portable step semantics.” **Impact:** A common selector form bypasses the only corpus-enforced prose quarantine and is rendered into the portable walkthrough and training artifacts, materially defeating the session’s central portability seam. **Evidence:** `css-id-selector` uses `(?<![\w#])#[A-Za-z_-][\w-]*`; in `button#save`, the character before `#` is a word character, so the rule cannot match. The added tests cover only a standalone `#green-button` and therefore do not expose this remediation gap. The rule and its tests must also cover type-qualified ID selectors while preserving legitimate exclusions.