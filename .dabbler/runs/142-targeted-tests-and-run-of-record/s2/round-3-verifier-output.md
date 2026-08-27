ISSUES FOUND

Round 1 and the exact Round 2 no-selected-tests bypass are resolved, but the fix still leaves a blocking mixed-change bypass.

- **Issue 1:** `selection_unknown` still passes pre-verification when another changed path selects any test.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/affected.py:606-622`, `ai_router/affected.py:650-672`, `ai_router/test_evidence.py:620-628`
  - **Failure scenario:** A repo has an expensive suite, no `testing.selection.smoke`, and a session changes both a mapped source file and an unmapped script/config file. The operator runs and records the mapped test command; `classify_preverify_command` marks it `targeted`, and `preverify_gate` accepts it because `result.test_paths` is non-empty, even though the unmapped file has no smoke fallback. Mixed code/support-file changes are common, and smoke defaults to empty, so this is probable for typical adopters with incomplete mappings.
  - **Acceptance criterion:** `JUDGMENT - With no testing.selection.smoke, if the working tree contains both a mapped changed path and an unmapped changed path, preverify_gate refuses and names the unmapped path even after a green preverify-targeted record for the mapped tests.`
  - **Details:** **Violation:** the plan requires “verify refuse to dispatch until valid targeted selection evidence exists,” and the new comment says an unmapped path with no smoke fallback is “the one state that must never read as satisfied.” **Impact:** verification can dispatch with no pre-verification evidence for part of the changed tree, defeating the session’s main refusal mechanism and making a targeted-looking record falsely sufficient. **Evidence:** the new refusal branch only runs under `not result.all_tests_affected and not result.test_paths`; once any other path selects a test, the gate skips the `result.risks` check and accepts any accepted record for the selected tests.