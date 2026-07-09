## ISSUES FOUND

- **Issue 1:** Verdict normalization is still missing; the writer accepts non-canonical spellings without canonicalizing them.
  - **Location:** `ai_router/session_state.py` (`is_tolerated_verdict_token`, `validate_verification_verdict`, `_flip_state_to_closed`); `ai_router/tests/test_close_session_verdict.py`
  - **Fix:** Canonicalize accepted verdicts on the writer path before writing state (for example, strip + uppercase to the exact blessed token), or reject non-exact spellings outright if exact-token persistence is the contract.
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task explicitly called for verdict **“reject/normalize/tolerate”** in Session 1 tests, and the new schema note now claims the blessed writer fails closed against an **“EXACT allowlist”** of tokens.
    - **Impact:** The on-disk `verificationVerdict` contract is still not canonicalized. Inputs like `"verified"` / `" VERIFIED "` are treated as valid, but there is no normalization step on the writer path in this change, so the exact-token persistence invariant is not actually enforced. For a persisted wire-format field whose literal token values are load-bearing, that is a real contract hole, not a cosmetic one.
    - **Evidence:** `is_tolerated_verdict_token()` accepts `token.strip().upper() in _ALLOWED_VERDICT_TOKENS`; the new test explicitly blesses lowercase input (`"verified"`); `_flip_state_to_closed()` only validates via `validate_verification_verdict()` and this diff adds no code that rewrites the accepted value to its canonical token before state is written.

## NITS

- **Nit:** Session artifacts are stale about the preflight behavior. `start_session.py` now probes live on every start, including re-entry, but `docs/session-sets/086-verification-verdict-token-legibility/activity-log.json`, `ai-assignment.md`, and the saved verification notes still describe the billed probe as being skipped on idempotent re-entry.
- **Nit:** Session artifacts are also stale about the verdict contract. They still describe “prefix-matched extension tokens,” but the implementation has moved to an exact allowlist for shipped extension tokens.