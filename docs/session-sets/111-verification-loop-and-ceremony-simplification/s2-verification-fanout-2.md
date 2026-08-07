**ISSUES FOUND**

**Issue 1:** Criteria contaminate each other because all findings share the same baseline/fixed worktrees.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A verifier criterion that writes files in the disposable checkout runs before another criterion. Because the second criterion sees the mutated checkout instead of the captured tree, a vacuous check can become `fails-before/passes-after` and auto-close falsely. This is probable because test/probe commands often write repo-local state, and verifier-authored commands are explicitly treated as untrusted.
- **Acceptance criterion:** `.venv/Scripts/python.exe -m pytest ai_router/tests/test_acceptance_harness.py -k per_criterion_worktree_isolation`
- **Acceptance expectation:** exit 0
- **Details:** Violation: each criterion is supposed to run against the captured pre-fix tree and fixed snapshot, but `run_harness()` creates one baseline worktree and one fixed worktree for the whole result loop. Impact: one criterion can manufacture baseline discrimination for a later finding, changing an open issue into an auto-closed one. Evidence: lines 685-694 reuse `before.path` / `after.path` for every `entry`; a throwaway reproduction made criterion 1 delete `sentinel.txt` only in the baseline checkout, after which criterion 2 auto-closed even though `sentinel.txt` existed in both clean trees.

**Issue 2:** Test-asset invalidation misses common test commands, so edited tests can still auto-close findings.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A verifier uses a normal command like `python -m pytest` or `python -m pytest ai_router/tests`; remediation edits `tests/conftest.py`, fixtures, or a test file to make the suite pass. The harness does not recognize the edited test asset and records `auto-closed`. This is likely because whole-suite and test-directory pytest commands are standard acceptance criteria.
- **Acceptance criterion:** `.venv/Scripts/python.exe -m pytest ai_router/tests/test_acceptance_harness.py -k modified_test_assets_invalidate_directory_and_implicit_runner`
- **Acceptance expectation:** exit 0
- **Details:** Violation: the contract says remediation-modified test assets invalidate the result. Impact: the person being judged can “move the ruler” and still get executable closure. Evidence: invalidation only inspects `referenced_paths(argv)`; `is_test_asset("tests")` and `is_test_asset("ai_router/tests")` both return `False`, and an end-to-end reproduction with a bare `python -m pytest` criterion auto-closed after `tests/test_widget.py` was rewritten.

**Issue 3:** Edited criteria are only detected after a previous harness run, not on the first run.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** After verification writes `sN-issues*.json` but before the first harness run, the remediator edits the acceptance command or weakens `expectedOutputContains`. The harness has no original criterion hash to compare against, treats the edited criterion as authoritative, and may auto-close. This is probable in this workflow because the same working tree contains mutable JSON artifacts and the first harness run is the normal path.
- **Acceptance criterion:** `.venv/Scripts/python.exe -m pytest ai_router/tests/test_acceptance_harness.py -k first_run_criterion_edit_invalidates`
- **Acceptance expectation:** exit 0
- **Details:** Violation: the requirement is “each unchanged criterion” and “an edited criterion invalidates the result.” Impact: first-run self-marking remains possible. Evidence: `_prior_criterion_hashes()` reads only an existing `sN-acceptance-round-*.json`; if none exists it returns `{}`, and `evaluate_criterion()` only invalidates on `if prior and prior != digest`. Correct behavior needs a source-bound original criterion, e.g. comparing against the stamped raw verification artifact or recording the criterion hash at envelope creation.

#### NITS

- **Nit:** The verifier prompt says criteria run with “no network,” but the harness only strips credential-like environment variables and does not enforce network isolation. Either enforce that claim or remove it from the prompt to avoid overstating containment.
- **Nit:** The supplementary/discovery next-action text says to run the harness for each findings-bearing round, but the printed command only covers the current `--round`; skipped earlier rounds fail closed but lose the intended time-saving closure path.