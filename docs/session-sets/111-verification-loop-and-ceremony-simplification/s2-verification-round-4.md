ISSUES FOUND

- Fix verdict: L1 raw-artifact binding catches first-run criterion edits -- fix-accepted
- Fix verdict: L2 pathless broad test-runner invalidation -- fix-accepted
- Fix verdict: L3 per-criterion disposable worktree isolation -- fix-accepted
- Fix verdict: L4 root-path test runner scope still lets edited tests auto-close -- fix-rejected
- Fix verdict: L5 -- duplicate-of L1
- Fix verdict: L6 documented `.venv/Scripts/python.exe` criteria execute via interpreter substitution -- fix-accepted
- Fix verdict: L7 output-based closure evidence is rendered in remediation-review -- fix-accepted
- Fix verdict: L8 containment claims now match the non-sandbox boundary -- fix-accepted
- Fix verdict: L9 file-scoped pytest invalidates conftest and fixture edits -- fix-accepted

- **Issue 1:** `pytest ./` scopes to `"."`, so edited tests can still auto-close a broad test-runner criterion.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A verifier writes the common broad criterion `python -m pytest ./`. The remediator leaves product code broken but edits `tests/test_widget.py` so the suite passes. Because `"."` is not normalized to the whole-repo scope, the harness misses the modified test asset and records `auto-closed`; this is probable because `./` is a normal repo-root path spelling for test commands.
  - **Acceptance criterion:** JUDGMENT - A pytest criterion whose path token normalizes to the repo root, including `python -m pytest ./`, must invalidate when remediation changes any test asset in the repo rather than auto-closing.
  - **Details:** **Violation:** the harness contract says `test-asset-modified` applies when remediation edits a test asset inside the criterion’s scope, and broad test-runner scope is meant to include the tests it collects. **Impact:** this preserves the “move the ruler” false-closure path L4 was supposed to eliminate, so a reasonable reviewer should not accept the remediation as complete. **Evidence:** `criterion_scopes(["python","-m","pytest","./"])` returns `["."]`; `modified_test_assets_in_scope()` only treats `""` as whole-repo scope and therefore misses `tests/test_widget.py`. A throwaway end-to-end harness run with only the test changed produced `outcome: "auto-closed"` with `scopes: ["."]`, `baselinePassed: false`, and `fixedPassed: true`.