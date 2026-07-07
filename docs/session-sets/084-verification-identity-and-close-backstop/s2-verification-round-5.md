## ISSUES FOUND

### Issue 1: The gate/backstop still allow cherry-picking an older favorable stamped row when multiple valid verification rows disagree
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The plan requires the close backstop to “**patch the disposition, then continue the close on `VERIFIED` / refuse with findings on `ISSUES_FOUND`**,” and step 5 says the stamped row “**must corroborate its own close**.” That requires one authoritative verification result for the close being performed, not “any historical row whose verdict matches the claim.”
  - **Impact:** A later blocking verification can still be laundered into a passing close if an earlier valid `VERIFIED` row exists for the same tree. A user can hand-edit `disposition.json` back to `VERIFIED`, the backstop will stand down, and the integrity gate will pass. That defeats the core “framework holds the last word” guarantee and would change a reasonable merge decision.
  - **Evidence:**  
    - In `ai_router/close_backstop.py`, `_existing_evidence_settles_the_close()` does:
      - `valid = [row for row in valid if row.get("verdict") == claimed]`
      - then, for `claimed == "VERIFIED"`, immediately `return True`
      So any valid stamped `VERIFIED` row settles the close, even if another valid stamped row for the same session later says `ISSUES_FOUND`.
    - In `ai_router/gate_checks.py`, `check_verification_integrity()` only checks:
      - `stamped_verdicts = {r.get("verdict") for r in valid_rows}`
      - `if claimed not in stamped_verdicts: fail`
      - otherwise `return True, ""`
      So the close passes whenever the claimed verdict appears in the set of valid rows; it does **not** require that the authoritative/latest verification result match the claim, and it does **not** reject contradictory valid rows.
    - For `ISSUES_FOUND`, the backstop skip path is also not bound to a specific stamped row: `_existing_evidence_settles_the_close()` consults `_latest_issues_envelope(...)` globally, not the issues artifact corresponding to the corroborating row.
  - **Correct answer:** Make corroboration choose exactly one authoritative stamped verification result for the close (for example, the latest valid round/artifact pair), or fail closed when multiple valid rows disagree. The disposition claim must match that authoritative result; “claimed verdict appears in any valid row” is not sufficient.