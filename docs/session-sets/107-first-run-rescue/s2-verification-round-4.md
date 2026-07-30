ISSUES FOUND

### Issue 1: The tutorial-fidelity gate remains materially fail-open despite claiming the earlier gate defect was fully fixed

- **Category:** Completeness / False Positive
- **Severity:** Major
- **Failure scenario:** A routine tutorial edit reintroduces a malformed or platform-incomplete shell command, removes one of the two test tallies, or lets the adoption tutorial’s starter-line procedure drift from the product. CI still passes. This is probable rather than theoretical: this session already introduced Windows-only completion commands, and the gate was specifically required because these documents are expected to evolve. A typical affected reader then cannot execute the first-run proof or receives stale session-start instructions.
- **Location:** `ai_router/scripts/tutorial_gate.py` → `check_bundle_test_count`, `check_ui_strings`, `check_bundle_literals`; `docs/session-sets/107-first-run-rescue/s2-remediation-round-3.md`
- **Details:**
  - **Violation:** The task requires a gate covering “the new document set, so the two tutorials cannot drift apart silently.” The remediation additionally says the prior gate finding was “**Accepted in full**,” although that finding explicitly required validating documented shell commands and binding the complete starter-line literal in both tutorials.
  - **Impact:** The principal regression-prevention deliverable can approve the same class of main-path documentation failure already found during this session. That undermines the claimed reason for adding the CI gate and should change the merge decision.
  - **Evidence:**
    - No check validates `.venv\Scripts\python.exe` or `.venv/bin/python` command forms. `_PATH_TOKEN_RE` does not inspect these extensionless executable paths, so typos or removal of a platform alternative remain green.
    - `check_bundle_test_count` requires at least one `Ran N tests` occurrence plus `FAILED` and `OK`; it does **not** require a tally at both endpoints. Removing either one of the two `Ran 2 tests...` lines still passes.
    - `_STARTER_LINE_TEMPLATE` is hard-coded in the gate. The gate never verifies that template against the shipped `buildSampleStarterLine` implementation.
    - The complete starter line is checked only in `hello-world.md`; `adopt-dabbler.md` is checked only for command titles and links. The disposition itself admits that its copy is “pinned only by the command-title check,” which does not validate the starter line.
    - The duplicate procedure remains concrete in both documents, despite the required end state of “zero duplicated procedure.”
- **Fix:** Validate the platform-specific commands against an explicit canonical contract; require separate failing and passing tally blocks; derive or verify the starter-line template from the shipped implementation; and either remove the repeated starter-line procedure from `adopt-dabbler.md` in favor of a link or enforce both documents against the same canonical source.

#### NITS

- **Nit:** `docs/tutorials/hello-world.md` ends with the required Full-tier sentence, but the adoption-guide link is in the preceding bullet rather than in that sentence as requested. The destination remains immediately discoverable, so this is non-blocking.
- **Nit:** The tutorial presents `Ran 2 tests in 0.000s` as expected literal output even though elapsed time varies by machine. The count and result are authoritative; the timing should be shown as variable or described accordingly.