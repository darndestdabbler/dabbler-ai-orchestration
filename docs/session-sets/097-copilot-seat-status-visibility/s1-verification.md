ISSUES FOUND

- **Issue 1: The permanent marker cannot distinguish a pending Copilot choice from a later explicit switch back to API**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A user selects Copilot, then cancellation, missing authentication, or insufficient providers prevents confirmation. The user subsequently chooses **Direct provider API keys** and rebuilds—the natural fallback for exactly this feature’s target users. The API build writes no new marker state and does not remove the existing marker, so every later snapshot continues showing the Copilot-unconfirmed warning despite API now being the user’s latest explicit choice. This is probable because falling back to API is the obvious recovery from the unsuccessful Copilot paths specifically covered by D1.
  - **Details:**
    - **Violation:** The required signal is a durable **“chosen but unconfirmed”** and **“honest”** status. Once the user explicitly rebuilds with API, Copilot is no longer the chosen pending transport.
    - **Impact:** The core status feature becomes a permanent false warning with no documented dismissal path. The user must either confirm a seat they no longer want or manually discover and delete `.dabbler/copilot-seat-status`. This materially undermines the session’s principal objective and should block merging the state model as implemented.
    - **Evidence:** `buildProjectStructureNoPrompt` writes `"unconfirmed"` whenever `seatDecision !== "skip-not-selected"`, but does nothing to the marker on `"skip-not-selected"`. `writeCopilotSeatStatusMarker` explicitly documents that the marker is **“never cleared.”** `deriveCopilotSeatChosenUnconfirmed` then returns true for every stale marker paired with the API profile:
      ```ts
      return marker === "unconfirmed" && durableProfile !== "copilot-cli";
      ```
      Therefore a subsequent explicit API build leaves the stale marker plus `transport.profile: api`, reactivating the warning indefinitely.
    - **Location:** `src/commands/gitScaffold.ts` and `src/utils/copilotSeatSetup.ts`
    - **Fix:** Add a durable reset/removal operation and invoke it whenever a completed Build records a non-Copilot selection. Add a transition test covering `Copilot attempted → API explicitly selected and rebuilt → no unconfirmed warning`.

#### NITS

- **Nit:** The install-incomplete matrix produces an inaccurate and potentially unusable note. The derivation deliberately treats `marker="unconfirmed", durableProfile=null` as true, but the fixed text says `router-config.yaml still runs on the api profile`; with no config, that is false. The command also starts with `.venv/bin/python` or `.venv\Scripts\python.exe`, which cannot be copy-pasted successfully in the explicitly tested “no venv materialized” state. Use state-specific text explaining that provisioning must first be repaired.

- **Nit:** Walk 2’s claim that the Copilot radio remains checked after **Developer: Reload Window** is not substantiated by the presented implementation or tests. D2 only protects a dirty choice held in the prior `gsState`; the durable marker is supplied solely to System Status and is never mapped back into the Getting Started profile. Either pin the existing webview-state persistence path with a reload-equivalent test or limit Walk 2’s expectation to persistence of the status note.

- **Nit:** All five operator-facing UAT rows have `"Passes": true` even though their own `ProgrammaticVerification` fields say actual VS Code rendering, reload, cancellation, and terminal behavior remain operator-only and were not run this session. This can cause tooling to report UAT complete prematurely; pending operator checks should not be pre-marked passed.

- **Nit:** The claimed zero-echo/grep result for `"one team per module"` is not literally true: the new tutorial, changelog, and UAT checklist still contain that exact phrase in negative comparisons. The new semantics are correct, but the stated literal grep claim should be narrowed to “no affirmative old framing remains.”

- **Nit:** Walk 1 claims Set-078-grade literal expectations, but abbreviates the warning toast with an ellipsis rather than supplying its complete expected literal string.