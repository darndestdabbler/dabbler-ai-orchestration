ISSUES FOUND

### Issue 1: Authentication beats require an OBS privacy scene that the prescribed setup never creates
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Every main-path recording starts with the Copilot CLI unsigned-in, so the recorder necessarily reaches Scene 1 beats 5 and 8. Those beats instruct them to switch OBS to “a scene that hides the device code,” but none of the four configured OBS scenes does so. This is probable on every recording, not an edge case. The recorder must improvise during a credential-sensitive beat or risk publishing a usable authentication code.
- **Details:**
  - **Violation:** The task requires literal, followable actions and OBS setup notes covering what must never appear, including credentials. Scene 1 says, **“Switch OBS to a scene that hides the device code”**, but the README defines only `Editor`, `Worktree`, `Browser`, and `Full screen`; all are screen-capture scenes, and no privacy/slate scene exists.
  - **Impact:** The scripts are not followable as written at mandatory authentication beats, and improvisation can expose a credential—the precise privacy failure the OBS notes are meant to prevent. This materially affects whether the recording scripts are safe to use.
  - **Evidence:** `docs/tutorials/video/README.md` → **OBS setup**; `scene-1-install-and-verify.md` beats 5 and 8; `scene-1-alt-direct-api.md` beats 5 and 6; `scene-2-alt-azure-devops.md` beat 5.
  - **Fix:** Add a defined `Privacy`/`Slate` OBS scene with no display or window capture, include it in the setup table, and name it literally in every authentication beat. Alternatively, explicitly script stopping recording and restarting after authentication.

#### NITS

- **Nit:** `video/README.md` says the scripts “were dry-run end to end by a human,” while the checklist explicitly says **“NOT YET WALKED.”** That statement is false in the current Session 3 deliverable and should become true only after Session 4 succeeds.
- **Nit:** Checklist Walk 13 says “Eight of the nine scripts were executed beat by beat,” but there are eight scene scripts total; scenes 1–6 plus the Azure DevOps alternate equal seven walked scripts, with the direct-API alternate only reviewed. Scene 6 beat 9 is also omitted from Walks 9–10, so scenes 1–6 are not literally executed beat by beat.
- **Nit:** Scene 3 beat 6 calls both GitHub templates “comment-only,” although `monorepo-ci.yml` already contains an active workflow. Consequently, Scene 4 beat 16’s claim that its PR is the workflow’s first execution is also false because Scene 3 directly pushes the scaffolded workflow to `main`.