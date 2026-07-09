**ISSUES FOUND**

- **Issue 1:** Copilot start-session preflight has a fail-open bypass on engine-detection errors
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `ai_router/start_session.py`, `_run_copilot_preflight_or_block()`
  - **Details:**
    - **Violation:** The session contract says the set “**Ends with: a mis-authed Copilot seat cannot start a session (preflight blocks)**,” and the helper’s own docstring says “**Fail-closed by construction — an unexpected internal error blocks rather than waves the seat through.**”
    - **Impact:** If engine classification/import fails, session start proceeds without running the preflight at all. That reopens the exact failure this change is supposed to prevent: an unauthenticated Copilot seat can still start a session.
    - **Evidence:** `_run_copilot_preflight_or_block()` wraps the `orchestrator_identity` import in `except Exception:` and returns `None`:
      ```python
      except Exception:
          ...
          return None
      ```
      In `_run_under_lock()`, `None` means “proceed,” and `register_session_start(...)` is executed. That is fail-open, not fail-closed.
  - **Fix:** Treat engine-detection/preflight-setup exceptions as blocking (`EXIT_BOUNDARY`) or let them abort start-up; do not return `None` on unexpected errors before the preflight decision is made.

- **Issue 2:** The new missing-ledger close gate silently disables itself on internal errors
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `ai_router/gate_checks.py`, `_check_session_ledger_present()`
  - **Details:**
    - **Violation:** The task required “**Make close fail loud on missing evidence**” and specifically that `check_verification_integrity` gains “**a ledger sub-check that runs FIRST (short-circuit)**.” The routed design saved in `s1-gate-placement-architecture.json` states that the ledger axis exists because “**the fully-simulated attack is precisely the case where the verdict looks corroborated (hand-forged stamp) but the ledger is absent.**”
    - **Impact:** Any exception importing or wiring the ledger detector makes the new sub-check return success, so close falls back to the stamp/verdict axis only. In the forged-stamp / no-ledger case this item was added to catch, the session can still close.
    - **Evidence:** `_check_session_ledger_present()` has a broad exception handler:
      ```python
      except Exception:
          ...
          return True, ""
      ```
      Then `check_verification_integrity()` only blocks when `ledger_passed` is false:
      ```python
      ledger_passed, ledger_remediation = _check_session_ledger_present(...)
      if not ledger_passed:
          return False, ledger_remediation
      ```
      So an internal error in the new ledger path silently disables the safety net instead of failing loud.
  - **Fix:** Make ledger-check failures fail closed: return a blocking failure message or let the exception abort close. Do not convert unexpected exceptions into `True, ""`.

#### NITS

- **Nit:** `session_state.validate_verification_verdict()` accepts lowercase/trimmed variants like `"verified"` by validating a normalized copy, but `_flip_state_to_closed()` persists the original string unchanged. The plan explicitly said “verdict reject/**normalize**/tolerate”; this implements reject/tolerate, not normalization.
- **Nit:** The session plan listed `ai_router/schemas/session-state.schema.json` as a touched file for the verdict-field note, but no schema update appears in the diff.