## ISSUES FOUND

**Issue 1:** The required live dogfood close is still not complete
- **Category:** Completeness
- **Severity:** Major
- **Location:** `docs/session-sets/084-verification-identity-and-close-backstop/session-state.json`, `docs/session-sets/084-verification-identity-and-close-backstop/session-events.jsonl`, working-tree `git status --short`
- **Details:**
  - **Violation:** The session plan requires: **“Dogfood: this session's own close runs the backstop live … `close_session` must produce the verification itself and the stamped row must corroborate its own close.”** It also says the session **“Ends with: … this session's own close was verified by the backstop, not by the orchestrator's hand.”**
  - **Impact:** A required acceptance criterion is unmet. The highest-risk path was supposed to be proven on this very session, but the repo state does not show a finished backstop-verified close. That should change a merge decision.
  - **Evidence:**  
    - `session-state.json` still has session 2 as `"status": "in-progress"` with `"completedAt": null`.  
    - `session-events.jsonl` for session 2 has:
      - `work_started`
      - `closeout_requested`
      - `closeout_failed` (`"failed_checks": ["verification_backstop"]`)
      - another `closeout_requested`
      but **no** `verification_completed` and **no** `closeout_succeeded`.  
    - `git status --short` still shows untracked `.close_session.lock` and `.lifecycle.lock`, which is consistent with an unfinished/stranded close attempt.
  - **Correct answer:** Finish the live `close_session` run so the backstop produces the verification and the session records a completed close, or remove/rollback any claims that imply the session has already met that end-state.

**Issue 2:** The backstop still permits a close to proceed on `ISSUES_FOUND`
- **Category:** Correctness
- **Severity:** Major
- **Location:** `ai_router/close_backstop.py` (`_existing_evidence_settles_the_close`, `run_close_backstop`), `ai_router/docs/close-out.md`, `ai_router/tests/test_close_backstop.py`
- **Details:**
  - **Violation:** Step 3 of the plan says the backstop must **“continue the close on `VERIFIED` / refuse with findings on `ISSUES_FOUND` / block explicitly on `verification_unavailable`.”**
  - **Impact:** A close can succeed even when the backstop verdict is `ISSUES_FOUND` (Minor-only). That is a direct change to the governance contract for final close decisions and would change a reasonable reviewer's merge decision.
  - **Evidence:**  
    - In `run_close_backstop`, only `classification.blocking` returns `STATUS_BLOCKING`; otherwise the function returns `STATUS_VERIFIED` even if `verdict == "ISSUES_FOUND"`.  
    - `_existing_evidence_settles_the_close` also treats a claimed `ISSUES_FOUND` with a non-blocking issues envelope as already settling the close.  
    - `test_close_backstop.py` explicitly codifies this with:
      - `test_minor_only_backstop_round_is_non_blocking`
      - `test_minor_only_settled_claim_stands_the_backstop_down`
    - `ai_router/docs/close-out.md` likewise states: **“VERIFIED / Minor-only → the close proceeds.”**
  - **Correct answer:** If the session plan is the contract, only `VERIFIED` should allow the close to proceed; any `ISSUES_FOUND` result should refuse the close. If policy intentionally changed, the spec/session plan must be updated to match before this is considered correct.