**ISSUES FOUND**

- Fix verdict: L1 close_preflight backstop-before-gates ordering for would-route evidence -- fix-accepted
- Fix verdict: L2 no-evidence backstop-spend path no longer misreported as verification_integrity refusal -- fix-accepted
- Fix verdict: L3 backstop-written bookkeeping ignore path on reruns -- fix-accepted
- Fix verdict: L4 session-number targeting -- fix-rejected
- Fix verdict: L5 set-terminal path-aware critique and contract gates included -- fix-accepted
- Fix verdict: L6 headless terminal policy gates reported without hard-blocking -- fix-accepted
- Fix verdict: L7 JSON no longer reports would_close true for undecided backstop route -- fix-accepted

**Issue 1:** The L4 remediation deletes the required session-number input instead of making it coherent.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/119-close-preflight-and-doc-only-findings/spec.md:198`, `ai_router/close_preflight.py:661`, `ai_router/close_preflight.py:1036`, `ai_router/close_preflight.py:1103`, `ai_router/tests/test_close_preflight.py:813`
- **Failure scenario:** A user or script following the Session 2 spec runs close_preflight for a specific session in a multi-session set. The CLI now exits with argparse error 2 for `--session-number` instead of producing the preflight report, so the promised “against a session set and session number” deliverable is unusable. This is probable because multi-session sets are the normal workflow here and the removed flag was the existing public way to specify the session.
- **Acceptance criterion:** `python ai_router/close_preflight.py --session-set-dir docs/session-sets/119-close-preflight-and-doc-only-findings --session-number 2 --json`
- **Acceptance expectation:** exit 1 output contains `"session_number": 2`
- **Details:** Violation: the spec requires close_preflight be “Runnable at any time against a session set and session number.” Impact: the fix changes a mixed-session-report bug into an invalid-invocation bug, so a reasonable reviewer still cannot merge L4 as fixed. Evidence: `evaluate()` no longer accepts a session number, the parser no longer defines `--session-number`, `main()` always calls `evaluate(session_set_dir)`, and the test now asserts the formerly promised argument raises.