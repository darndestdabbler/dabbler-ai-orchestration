## ISSUES FOUND

- **Issue 1:** `round1_verifier_tier()` still falls through to a later round's tier when the first matching round-1 row is present but unreadable.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The accepted round-1 fix was that `round1_verifier_tier()` now “returns the FIRST matching `session-verification` row's tier” and that a missing answer “fails OPEN.” The current implementation does not stop at the first matching row unless its `tier` is a readable `int`.
    - **Impact:** If the round-1 metrics row exists but its `tier` field is malformed/unreadable, the guard can enforce a later round's tier instead of treating round 1 as unknown. That changes CLI behavior from fail-open to spurious refusal (`EXIT_USAGE`) on a substantive re-verify, which is a merge-blocking regression in the exact guard fix this round was supposed to confirm.
    - **Evidence:** In `ai_router/verify_session.py`, `round1_verifier_tier()` scans top-to-bottom but only returns on `if isinstance(row_tier, int) and not isinstance(row_tier, bool): return row_tier`. If the first matching row has an unreadable tier, the function keeps scanning and may return a later round's tier. There is no early `return None` once the first matching `(task_type, session_set, session_number)` row is found but unreadable, and no regression test covers “malformed round-1 row + later valid round-2 row.”
    - **Correct answer:** Once the first matching `session-verification` row for that `(set, session)` is found, treat that as round 1: return its tier if readable, otherwise return `None` so the guard truly fails open. Add a regression test for a malformed round-1 row followed by a later valid row.