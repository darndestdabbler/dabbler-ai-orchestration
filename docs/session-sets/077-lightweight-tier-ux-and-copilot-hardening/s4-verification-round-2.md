- **Issue** → A malformed later `WAIVED` does not null out an earlier verdict in the same round, so the new “blank line means unrecognized waiver” behavior can still resolve to `VERIFIED`/`ISSUES_FOUND` instead of the intended soft-warn/no-verdict outcome.
  **Location** → `ai_router/external_verification.py`, `_parse_round_body()`, `if token == VERDICT_WAIVED:` branch, `if not reason: continue`
  **Fix** → Before `continue`, clear the current round verdict state:
  ```python
  verdict = None
  waive_reason = None
  continue
  ```
  Add a regression test where a round contains an earlier valid verdict and a later malformed `WAIVED` (including the blank-line-separated `Reason:` case), and assert `result.verdict is None`.