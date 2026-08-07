ISSUES FOUND

**Issue 1:** Edited acceptance criteria are only detected after a previous harness artifact exists, so a first-run edit can still auto-close.

**Category:** Correctness  
**Severity:** Major  
**Failure scenario:** On the normal first post-remediation harness run, the remediator edits the mutable `sN-issues*.json` acceptance block before running the harness. Because there is no prior `sN-acceptance-round-<R>.json`, the harness has no original hash to compare against, treats the edited criterion as unchanged, and can auto-close an unfixed Major finding. This is probable on the main path because the first harness run is the normal path and the current implementation has no other immutable source of the verifier-authored contract.  
**Acceptance criterion:** JUDGMENT - The first harness run must refuse or mark `criterion-changed` when the issue acceptance contract differs from the verifier-authored contract captured at finding time, before executing any edited command.  
**Details:** Violation: the plan says each **unchanged** criterion runs and “an edited criterion ... invalidates the result.” Impact: a false `auto-closed` finding can change the merge decision by treating an unfixed blocker as settled. Evidence: `_prior_criterion_hashes()` only reads a previous acceptance artifact, and `evaluate_criterion()` only invalidates under `if prior and prior != digest`; with no prior artifact, an edited criterion is trusted. A throwaway repo probe edited the criterion before the first harness run and the result was `outcome: "auto-closed"`.

**Issue 2:** Broad test-runner criteria bypass test-asset invalidation.

**Category:** Correctness  
**Severity:** Major  
**Failure scenario:** A verifier writes a common executable criterion like `python -m pytest`. The remediation edits `tests/test_*.py` so the suite passes while leaving product code broken. Because the command contains no path-shaped test token, `referenced_paths(argv)` yields no test asset to compare, so the harness can mark the finding `auto-closed` even though the person being judged edited the ruler. This is probable because whole-suite pytest commands are normal acceptance criteria.  
**Acceptance criterion:** JUDGMENT - A broad test-runner criterion such as `python -m pytest` must be invalidated when remediation modified any test asset that runner would execute, rather than auto-closing.  
**Details:** Violation: the spec requires that “an edited ... test asset invalidates the result,” and the design says invalidation exists so “the person being judged cannot edit the ruler.” Impact: a remediator can obtain false closure by changing tests instead of fixing the defect. Evidence: `evaluate_criterion()` checks only `for path in referenced_paths(argv)` before calling `is_test_asset(path)`; for `python -m pytest`, no test path is referenced. A throwaway repo probe changed only `tests/test_widget.py`, left product broken, and the harness returned `outcome: "auto-closed"` with `modifiedTestAssets: null`.

#### NITS

- The verifier template promises criteria run with “no network,” but `run_criterion_in()` only strips credentials and calls `subprocess.run()` normally. Either enforce network isolation or remove that promise.
- `assemble_acceptance_block()` does not render `expectedOutputContains` or output evidence for criteria whose pass/fail depends on output; it can show `exit 0 -- FAILED` without the substring evidence that explains the failure.
- The supplementary next-action text says to run the harness for each findings-bearing round but prints only the current round’s command, so a user can easily skip earlier discovery-round criteria.