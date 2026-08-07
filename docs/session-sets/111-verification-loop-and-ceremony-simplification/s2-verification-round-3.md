**ISSUES FOUND**

- Fix verdict: L1 first-run edited criteria are bound to raw verifier artifacts -- fix-accepted
- Fix verdict: L2 broad pathless test runners now scope to the whole repo -- fix-accepted
- Fix verdict: L3 each criterion gets fresh disposable worktrees -- fix-accepted
- Fix verdict: L4 test-asset invalidation still misses pytest-loaded conftest/fixture assets -- fix-rejected
- Fix verdict: L5 -- duplicate-of L1
- Fix verdict: L6 documented venv/bare Python criteria are interpreter-substituted -- fix-accepted
- Fix verdict: L7 output-based closures now render expected-output evidence -- fix-accepted
- Fix verdict: L8 containment claims now match the narrower non-sandbox boundary -- fix-accepted

**Issue 1:** File-scoped pytest criteria can still auto-close after remediation edits `conftest.py` or fixture test assets.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A verifier writes the common targeted criterion `python -m pytest tests/test_widget.py`; the remediator changes `tests/conftest.py` or a fixture so that test passes while product code remains broken. This is probable because the template explicitly recommends targeted existing tests, and pytest `conftest.py`/fixtures are standard dependencies of targeted test-file runs.
- **Acceptance criterion:** JUDGMENT - A pytest criterion targeting a specific test file must be invalidated when remediation changes `conftest.py` or fixture assets that pytest loads for that test, rather than recording `auto-closed`.
- **Details:** **Violation:** the contract says the harness invalidates a criterion whose test assets the remediation modified, and the prompt recommends targeted existing tests as criteria. **Impact:** the retained remediation review can be told a finding is criteria-closed even though the remediator only moved the test ruler, changing a reasonable merge decision. **Evidence:** the new scope logic only matches changed test assets where `path == scope` or `path.startswith(scope + "/")`; for `python -m pytest tests/test_widget.py`, the recorded scope is only `tests/test_widget.py`, so sibling `tests/conftest.py` is ignored. A minimal harness run with only `tests/conftest.py` changed produced `baselinePassed: false`, `fixedPassed: true`, and `outcome: "auto-closed"`.