VERIFIED

The core marker lifecycle, first-seed precedence carve-out, confirmation gate, recovery-command wiring, and copy changes show no blocking correctness defect. The remaining gaps are non-blocking validation and reporting issues.

#### NITS

- **Nit:** The status note can assert an API transport state without evidence.  
  **Location:** `deriveCopilotSeatChosenUnconfirmed` returns `true` for `("unconfirmed", null)`, while `COPILOT_SEAT_UNCONFIRMED_TEXT` says `router-config.yaml still runs on the api profile`.  
  **Fix:** Render state-specific copy for a missing/unreadable profile, or only make the API-specific assertion when the durable profile is `"api"`.

- **Nit:** The final rendered Explorer state was not covered by the claimed Layer 3 run.  
  **Location:** `s1-conventions.md` says remediation touched no rendering surface, but remediation changed `rerunRefreshHint()`, which is sent through `CustomSessionSetsView` and rendered in the System Status strip. Layer 3 ran before that change.  
  **Fix:** Re-run Layer 3 against the final tree or correct the validation claim.

- **Nit:** The new recovery command’s wrapper is not directly tested despite the requirement that automation-checkable UAT steps be pre-verified.  
  **Location:** `copilotSeatSetupCommand.ts`; UAT Walk 3 explicitly acknowledges there is no dedicated Layer 2 suite. Existing tests cover the delegated setup flow, not command registration, workspace selection, `.venv` validation, marker writing, or dispatch.  
  **Fix:** Export an injectable handler and test the no-workspace, no-venv, and successful-dispatch paths plus registration.

- **Nit:** Operator-only UAT checks are pre-marked as passed.  
  **Location:** All five substantive rows in `097-copilot-seat-status-visibility-uat-checklist.json` have `"Passes": true`, although their `ProgrammaticVerification` fields say real cancellation, reload, Command Palette execution, and rendering remain for the operator.  
  **Fix:** Leave those rows pending until the live UAT is performed, or separate automated-precheck status from operator pass status.