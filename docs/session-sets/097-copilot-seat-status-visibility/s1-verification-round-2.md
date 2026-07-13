ISSUES FOUND

- **Issue 1: The advertised re-run command refreshes the catalog but bypasses the confirmation path that promotes `transport.profile`**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Any user who cancels or fails seat setup and follows the persistent strip’s only recovery instruction will run `python -m ai_router.copilot_catalog --refresh`. This is the primary path for the feature’s target users, not an edge case. Even when the probe confirms two providers, the command does not invoke the extension-side `performCopilotSeatSetup` flow that conditionally writes `transport.profile: copilot-cli`; the profile therefore remains `api`, and the persistent warning remains.
  - **Location:** `src/utils/copilotSeatSetup.ts::rerunRefreshHint`; UAT Walk 3.
  - **Details:**
    - **Violation:** D1 requires a copy-pasteable **“re-run seat setup”** command, and Walk 3 explicitly promises that running it makes `router-config.yaml` read `profile: copilot-cli` and clears the note.
    - **Impact:** The recovery instruction does not complete seat setup, so users can successfully refresh the lockfile yet remain permanently on the API profile with the warning still displayed. This defeats the feature’s central recovery promise.
    - **Evidence:** `rerunRefreshHint` invokes only `ai_router.copilot_catalog --refresh`. The profile-confirmation/write machinery is implemented in the TypeScript seat-setup flow (`performCopilotSeatSetup`, `writeConfigAtomically`), which a terminal invocation of the Python catalog module does not execute. No `ai_router/` change adds equivalent profile promotion, and the UAT itself describes the command’s result as writing `copilot-catalog.lock`.
  - **Fix:** Provide a recovery command that executes the complete confirmation-gated seat-setup flow, or add a supported CLI operation that both refreshes the catalog and atomically promotes the profile only after confirming at least two providers. Add an integration test proving the exact displayed command changes the durable profile and makes the status derivation false.

- **Issue 2: The claimed post-reload Copilot-radio persistence is not implemented**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Walk 2 requires every operator to run **Developer: Reload Window** after an unconfirmed Copilot attempt. Reloading destroys the in-memory `gsState`; reconstruction then sees durable `transport.profile: api`, `profileDirty: false`, and `lastProfileSeed: null`, so `restoreGsState` selects Direct API. The Walk 2 expectation that the Copilot radio remains checked will therefore fail deterministically.
  - **Location:** `media/session-sets-tree/gettingStartedHtml.js::restoreGsState`; `CustomSessionSetsView.ts::buildSystemStatus`; UAT Walk 2.
  - **Details:**
    - **Violation:** Walk 2 states that after a full reload, **“the ‘GitHub Copilot CLI seat’ radio is still checked.”**
    - **Impact:** The supplied UAT cannot pass as written, and a routine reload again makes the form contradict the user’s latest explicit Copilot choice. Although the persistent strip remains, the radio-survival claim is false.
    - **Evidence:** The first-seed carve-out works only when the previous in-memory state still contains `transportProfile: "copilot-cli"` and `profileDirty: true`. On reload, no code uses `.dabbler/copilot-seat-status` to reconstruct the form choice; that marker is wired only into `SystemStatusPayload`. With fresh state and an `api` seed, `protectDirtyFlip` is false and `restoreGsState` applies `api`.
  - **Fix:** On fresh-state reconstruction, use the unconfirmed-choice marker to restore the Copilot radio while continuing to report the durable transport as unconfirmed/API, without weakening the confirmation gate. Add a teardown/recreation test. If reload persistence is intentionally out of scope, remove that expectation from Walk 2 rather than claiming unsupported behavior.

#### NITS

- **Nit:** The verification counts are stale after the remediation delta. `copilotSeatSetup.test.ts` adds 12 tests, not 10, and splitting the scaffold matrix adds one net test; from the stated 1487 baseline, the current tree should contain 1511 tests rather than 1508. The UAT also references obsolete identifiers such as `mark-seat-chosen`/`markSeatChosenCalls`, while the current tests use `record-seat-choice:chosen`/`recordSeatChoiceCalls`.