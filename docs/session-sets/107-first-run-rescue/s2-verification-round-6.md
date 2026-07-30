ISSUES FOUND

### Issue 1: The tutorial gate still accepts malformed commands and forbidden first-run content

- **Category:** Completeness / False Positive
- **Severity:** Major
- **Failure scenario:** During routine maintenance, a contributor edits both platform variants together and introduces the same typo, such as changing `-m unittest` to `-m unitest`. CI remains green because the gate checks only Windows/POSIX equality, not whether either command is valid. Every reader then receives `No module named unitest` and cannot complete the red-to-green proof. This is probable because paired commands are naturally copied or globally edited together, and this session already introduced command defects that the gate was specifically added to prevent.
- **Details:**
  - **Violation:** The task requires a literal gate “so the two tutorials cannot drift apart silently.” The round-4 remediation also accepted the requirement to validate platform commands against a canonical contract, but the implementation only validates symmetry.
  - **Impact:** The principal regression gate can approve an unrunnable main path. That materially undermines the first-run objective and should change the merge decision.
  - **Evidence:**
    - **Location:** `ai_router/scripts/tutorial_gate.py` → `_interpreter_invocations` and `check_platform_pairs`.
    - Both functions compare only argument multiplicities between `.venv\Scripts\python.exe` and `.venv/bin/python`. Replacing every `-m unittest` occurrence with `-m unitest` leaves equal `Counter` values and produces no violation.
    - No other check establishes the canonical test command. `check_bundle_test_count` validates only the printed `Ran N tests` output, while `check_bundle_literals` validates paths and bundle fields.
    - **Location:** `ai_router/tests/test_tutorial_gate.py` → `test_mistyped_platform_alternative_is_flagged`. The test changes only the POSIX `main.py` argument, proving mismatch detection but not canonical-command validation.
    - Two additional advertised negative constraints remain bypassable:
      - `_GIT_COMMAND_RE` does not match raw option-form commands such as `git --version`, `git -C ...`, or `git -c ...`. Adding `git --version` beside the new Git prerequisite is a particularly plausible edit.
      - `_untagged_yaml_blocks` misses valid unlabelled block-scalar YAML such as `script: |\n  python build.py\n  python test.py`, because continuation lines match neither accepted pattern. Round 5 explicitly requested support for common block-scalar continuations, but the remediation did not implement it.
  - **Correct answer / Fix:** Validate an explicit canonical multiset of required interpreter invocations, including `-m unittest` and `main.py`, rather than only comparing platforms. Add a symmetric-typo regression test, detect Git option-form invocations, and classify YAML block-scalar continuations.

#### NITS

- **Nit:** Session step 1 explicitly required running `Dabbler: Try a sample project` to observe what a reader sees, but `s2-desk-check.md` states that the command was not executed through the extension; the bundle was rendered by a script and the command was only read and reasoned about. Session 3’s acceptance walk limits the consequence, but the recorded evidence does not substantiate completion of this required S2 reconnaissance step.