ISSUES FOUND

- **Issue 1: The quarantine gate misses common CSS ID selectors in portable step text**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/scenario.py, ai_router/scenario_lint.py, ai_router/scenario_render.py, ai_router/tests/test_scenario_lint.py, ai_router/tests/test_scenario_render.py`
  - **Failure scenario:** An author writing a browser scenario copies a common selector such as `#green-button` into a portable `action` or `expect`. The parser accepts it, `scenario_lint` reports no finding, and the corpus test passes; the renderer then publishes that target-specific instruction in the walkthrough and training document. This is probable because CSS ID selectors are commonplace and the session’s own render test fixture already uses `#green-button`.
  - **Acceptance criterion:** JUDGMENT - Does `scenario_lint` flag a portable action such as `Click #green-button`, while continuing to ignore the same selector when it appears only under `drivers:`?
  - **Details:** **Violation:** The requirement says, “Playwright selectors and any other target-specific mechanics live in platform-specific blocks, never in the portable step semantics.” **Impact:** The committed-corpus gate can certify a scenario as portable while its reader-facing documents contain an unreadable, target-specific locator, materially defeating the session’s central quarantine objective. **Evidence:** `scenario.py` accepts any non-empty action text; `scenario_render.py` renders that text directly; and `scenario_lint.py` has rules for attribute selectors, hyphenated class selectors, locator prefixes, XPath, and driver APIs, but no CSS ID-selector rule. `test_scenario_lint.py` likewise has no `#id` falsifier, despite `test_scenario_render.py` demonstrating `#green-button` as a realistic selector. The fix is to detect CSS ID selectors in portable text with positive and legitimate-look-alike falsifiers, without making rendering itself refuse.

## NITS

- **Nit:** `check_scenario_dir` claims byte-for-byte comparison but uses `Path.read_text`, whose universal-newline handling normalizes CRLF and lone CR to LF. Line-ending-only byte drift therefore passes (`ai_router/scenario_render.py`).
- **Nit:** The exemplar totals 46 seconds in `scenario.yaml`, `chapters.json`, and both generated prose documents, while `docs/walkthroughs/README.md` and the changelog fragment say 44 seconds.
- **Nit:** `yaml.safe_load` silently accepts duplicate mapping keys with last-value-wins behavior. A duplicated `action`, `expect`, or `steps` key can therefore discard authored content without the strict validator refusing it (`ai_router/scenario.py`).