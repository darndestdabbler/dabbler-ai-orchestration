## ISSUES FOUND

- **Issue 1:** Re-entry skips the only auth-proving check based on repo state, not actual seat auth state
  - **Location:** `ai_router/start_session.py` (`_run_under_lock()`), `ai_router/copilot_preflight.py` (`run_preflight()`)
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task contract says Session 1 must end with **“a mis-authed Copilot seat cannot start a session (preflight blocks)”** and the shipped-summary claims the preflight is **“wired into `start_session` to block a mis-authed copilot-cli seat before any state is written (skips the billed probe on idempotent re-entry)”**.
    - **Impact:** A seat that is no longer actually authenticated can still resume an in-progress session through `start_session`. That reopens the exact failure mode this set is supposed to prevent: the seat is allowed to proceed even though a later verification dispatch can still fail at auth time.
    - **Evidence:** Re-entry is detected only by shared session state:
      ```python
      is_reentry = bool(current_in_flight and requested == current)
      preflight_block = _run_copilot_preflight_or_block(
          args, run_live_probe=not is_reentry
      )
      ```
      When `is_reentry` is true, `run_preflight(..., run_live_probe=False)` returns success after only the free checks:
      ```python
      if not cred_dir.is_dir():
          return PreflightResult(... ok=False ...)
      if not run_live_probe:
          return PreflightResult(ok=True, stage=STAGE_CREDENTIAL, ...)
      ```
      So any seat with an existing `~/.copilot` directory but invalid auth state (logged out, wrong-host login, revoked license, expired token state) passes re-entry without the live probe. The code has no same-seat/same-auth proof; it treats any in-flight session as “already probed.”
  - **Fix:** Do not skip the live probe on re-entry unless you can prove the same authenticated seat/context that passed earlier. Otherwise always run the live probe, or persist a seat-bound preflight proof and validate against it before allowing the skip.

## NITS

- **Nit:** The spec explicitly called for verdict **“reject/normalize/tolerate”**, but the implementation only shows reject/tolerate. `validate_verification_verdict("verified")` succeeds via `token.strip().upper()`, but no normalization path is added in the diff.
- **Nit:** The spec listed `ai_router/schemas/session-state.schema.json` as a touched file for the verdict-field note, but no schema/documentation update for that field appears in the diff.