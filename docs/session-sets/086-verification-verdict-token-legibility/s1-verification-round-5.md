## ISSUES FOUND

- **Issue 1:** The new ledger gate still has a fail-open bypass on filesystem/read errors inside `writer_discipline`
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task required **“Make close fail loud on missing evidence”** and the landed summary claims `gate_checks.check_verification_integrity` now has a ledger sub-check that **“runs FIRST (short-circuit)”** and fails closed on detector problems. `_check_session_ledger_present()` itself also claims: **“An import OR a runtime failure of the detector must NOT silently disarm it.”**
    - **Impact:** A Full-tier close can still bypass the new ledger safety net if `session-events.jsonl` exists but cannot be read/opened/stat'ed. In the exact scenario this change was added to catch — forged stamp/verdict evidence with no trustworthy router ledger — close can still fall through to the old stamp/verdict axis and succeed. That is merge-blocking because the new enforcement can be defeated by a tampered or unreadable ledger path.
    - **Evidence:** `ai_router/writer_discipline.py` still returns a silent success on `OSError` even when `require_ledger=True`:
      ```python
      try:
          state_mtime_ns = state.state_file.stat().st_mtime_ns
      except OSError:
          return []
      ...
      try:
          for event in iter_session_events(events_path):
              ...
      except OSError:
          return []
      ```
      `ai_router/gate_checks.py` then treats “no reports” as pass:
      ```python
      reports = detect_writer_bypass(view, require_ledger=True)
      ...
      if not absence:
          return True, ""
      ```
      So a path like `session-events.jsonl` being unreadable, permission-denied, or replaced with a directory does **not** block close; it silently disables the new ledger axis.  
      **Correct answer:** when `require_ledger=True`, read/open/stat failures for the state file or events ledger must surface as a blocking failure/report, not `[]`.

## NITS

- **Nit:** Session artifacts are stale against the code. `activity-log.json`, `ai-assignment.md`, and the saved verification notes still describe the preflight as **skipping** the live probe on idempotent re-entry and describe verdict handling as **prefix-matched**; the current code probes on every start and uses an exact writer allowlist plus normalization.