ISSUES FOUND

- **Issue 1: The never-cleared marker revives a false Copilot warning after an intentional switch to API**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A user selects Copilot, then either abandons an unsuccessful setup in favor of Direct API or later switches a confirmed Copilot workspace back to API. Such profile switching is an explicitly supported transition in the session plan, so this is probable rather than hypothetical. After the API build, the strip permanently claims that Copilot remains selected but unconfirmed, with no supported dismissal path.
  - **Details:**
    - **Violation:** D1 promises a durable **“chosen but unconfirmed”** and **“honest”** status. Once the operator explicitly chooses API, Copilot is no longer the chosen transport, so the warning is false.
    - **Impact:** A principal changed surface emits a persistent, actionable fault for a choice the operator deliberately abandoned. The only apparent ways to suppress it are to confirm an unwanted Copilot seat or manually discover and delete an internal marker. This breaks the core status-honesty objective and should block merge.
    - **Evidence:** `writeCopilotSeatStatusMarker` writes only `unconfirmed`; its surrounding comment explicitly says, **“It is never cleared.”** `buildProjectStructureNoPrompt` writes it on Copilot decisions but performs no corresponding clear on `skip-not-selected`. `deriveCopilotSeatChosenUnconfirmed` consequently returns true for every later API profile whenever the stale marker exists:
      ```ts
      return marker === "unconfirmed" && durableProfile !== "copilot-cli";
      ```
      The required `copilot-cli → api` seed transition further establishes switching back to API as supported behavior.
    - **Location:** `src/utils/copilotSeatSetup.ts`, `src/commands/gitScaffold.ts`, and the missing transition case in `copilotSeatSetup.test.ts` / `gitScaffoldSeatSetup.test.ts`.
    - **Fix:** Clear or replace the pending marker when an explicit API or Lightweight build supersedes the Copilot choice. Add tests for pending-Copilot → API and confirmed-Copilot → API, proving the note does not persist or revive.

#### NITS

- **Nit:** The reload UAT expects the Copilot radio to remain checked, but the implementation only persists the strip signal. `copilotSeatChosenUnconfirmed` is wired solely into `SystemStatusPayload`; it is not used to seed Getting Started state. D2 protects an in-memory dirty flip during the first seed repaint, while the code describes that control state as volatile.  
  **Location:** UAT checklist, Walk 2.  
  **Fix:** Remove the post-reload radio expectation or implement and test durable restoration of the pending Copilot choice.

- **Nit:** The claim that every automation-checkable UAT step was pre-verified is unsupported for Walk 3. The `rerunRefreshHint` test checks only that the string contains arguments and is deterministic; it does not prove that executing the displayed `ai_router.copilot_catalog --refresh` command changes `router-config.yaml` to `copilot-cli`. The cited derivation test assumes that profile transition has already happened.  
  **Location:** UAT checklist Walk 3 and `copilotSeatSetup.test.ts` under `rerunRefreshHint`.  
  **Fix:** Add an integration test proving the exact displayed command performs the confirmation-gated profile transition, or adjust the recovery command and UAT claim.

- **Nit:** The note unconditionally states that `router-config.yaml` “still runs on the api profile,” while the derivation deliberately returns true when `durableProfile` is `null`. A missing, unreadable, or unrecognized config is not evidence that the file runs on API.  
  **Location:** `systemStatusHtml.js` and `deriveCopilotSeatChosenUnconfirmed`.  
  **Fix:** Supply the actual durable-profile state to rendering and use honest copy for the null/unreadable case, or only make the API-specific assertion when the reader returned `"api"`.