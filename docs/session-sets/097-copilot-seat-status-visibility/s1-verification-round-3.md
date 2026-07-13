VERIFIED

The fix delta correctly wires the recovery instruction to a contributed and registered command that executes the confirmation-gated setup flow. The marker-clearing remediation and persisted webview-state explanation also resolve the prior ledger findings without weakening the transport-profile confirmation gate.

- Fix verdict: L1 explicit Direct-API rebuild clears the stale Copilot marker -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 recovery instruction now invokes the profile-promoting seat-setup flow -- fix-accepted
- Fix verdict: L4 radio persistence across reload is provided by persisted webview state -- fix-accepted

#### NITS

- **Nit:** Walk 3 places the `.venv` negative-check action inside `Expectation` and calls its folder the “THIRD fresh empty folder,” although only one fresh folder has been opened at that point. → **Location:** `097-copilot-seat-status-visibility-uat-checklist.json`, Walk 3. → **Fix:** Move the negative-check steps into `HumanAction` and call it the second fresh folder.