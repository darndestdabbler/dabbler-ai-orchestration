ISSUES FOUND

- **Issue 1:** Pre-verification still recommends and accepts a full-suite command for ordinary non-repo-wide changes with an empty test selection.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/affected.py:495`, `ai_router/affected.py:526`, `ai_router/verify.py:577`, `ai_router/router-config.yaml:564`
  - **Failure scenario:** A typical docs/AGENTS-only change is explicitly mapped to no tests in `router-config.yaml`; `verify` then tells the operator to run `python -m pytest` as preverify evidence, and `classify_preverify_command` records that bare suite command as `targeted`. That makes the full suite run before verification on a normal path, despite the policy this session exists to enforce.
  - **Acceptance criterion:** `JUDGMENT - For a non-repo-wide change whose selector returns zero selected tests, preverification must not instruct, record, or accept the bare full-suite command unless the all-tests-affected proof or a non-empty operator override applies.`
  - **Details:** **Violation:** the task requires the full-suite command “only after the final verified tree” and says preverification must reject full-suite fingerprints except the two audited exceptions. **Impact:** this changes the merge decision because the main gate still permits the forbidden preverify full-suite path for declared empty selections. **Evidence:** `targeted_command` returns the base suite command when `not result.test_paths`, `classify_preverify_command` treats that as `POLICY_TARGETED`, and `verify` prints that command as the required preverify run.

**NITS**

- **Nit:** The generated lifecycle text still tells agents to “Run the complete suite” after verification but does not print the declared full-suite command there; it only prints the record command.