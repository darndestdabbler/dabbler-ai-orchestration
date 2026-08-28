VERIFIED — The fix now derives the editable session plan from `repository.planPath` and accurately directs respecification into a new session number, consistent with the cited immutable-session and append-only-ledger contracts. The disputed respecification finding is **WITHDRAWN**; the agency-detail, action-workflow, and nonterminal-action findings remain resolved.

## NITS

- **Nit:** **RE-RAISED** — Historical terminal status is still inferred using the repository’s current verification cap, so changing that cap can relabel previously completed sessions. → **Location:** `ai_router/progress.py` (`build_verification_view`) → **Fix:** Persist or derive each session’s terminal status using the cap/disposition recorded when that session ended rather than the current configuration.