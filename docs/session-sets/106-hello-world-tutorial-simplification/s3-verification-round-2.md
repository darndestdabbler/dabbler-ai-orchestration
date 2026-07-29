# ISSUES FOUND

## Issue 1: The Azure DevOps take requires recording a private repository that the OBS privacy contract forbids

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A recorder chooses the required Azure DevOps alternate and follows Beat 1, creating and displaying a **Private** project and repository. They then cannot satisfy the README’s hard rule—and the original specification—that private repositories must never appear on screen. This is certain for anyone recording the ADO take as written, leaving them unable to complete the take and pass the whole-script privacy attestation without improvising.
- **Details:**
  - **Violation:** The specification requires OBS notes covering “what must never be: real tokens, org names, private repos.” The README implements this as a “hard checklist” stating **“Private repositories … must never be on screen.”**
  - **Impact:** The required ADO alternate is incompatible with the recording-safety contract. A recorder must either violate the privacy checklist or depart from the scripted action, so the take cannot be attested as followable as written.
  - **Evidence:** `scene-2-alt-azure-devops.md`, Beat 1 explicitly instructs: **“visibility Private”**, then expects the repository UI to remain on screen throughout the take. `video/README.md` unconditionally forbids private repositories on screen.
  - **Location:** `docs/tutorials/video/README.md` → “What must never be on screen”; `docs/tutorials/video/scene-2-alt-azure-devops.md` → Beat 1.
  - **Fix:** Use a dedicated public scratch ADO project/repository if supported, or explicitly reconcile the privacy policy and recording setup with a narrowly defined safe scratch-project exception. The README and alternate must no longer impose mutually exclusive requirements.

## Issue 2: The direct-API route later tells Sam to sign into the Copilot CLI

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A recorder selects the direct-provider-key alternate specifically because they are not using a Copilot CLI seat. On reaching Scene 5, Beat 3 tells them that Sam performs “all of part one, including signing in to the Copilot CLI.” The alternate’s supposedly exhaustive downstream-change table does not override this beat. A direct-key recorder must therefore invent a replacement setup or falsely narrate that Sam signed into a service this route deliberately omitted.
- **Details:**
  - **Violation:** The direct-key script claims it lists the three downstream differences and that **“Everything else … is identical.”** Every scene beat must remain literal and performable for the selected route.
  - **Impact:** The alternate ceases to be a coherent end-to-end route when the teammate joins. The recorder cannot truthfully execute Scene 5 as written, which materially defeats the purpose of documenting the alternate take.
  - **Evidence:** `scene-1-alt-direct-api.md` replaces Scene 1 entirely and substitutes an API-key-backed AI agent for Copilot. Its downstream table only changes Scene 3 and the paste mechanic in Scenes 4–6. `scene-5-second-module.md`, Beat 3 nevertheless says Sam performs **“all of part one, including signing in to the Copilot CLI.”**
  - **Location:** `docs/tutorials/video/scene-1-alt-direct-api.md` → “What this take changes downstream”; `docs/tutorials/video/scene-5-second-module.md` → Beat 3.
  - **Fix:** Add Scene 5 Beat 3 to the direct-key substitution table and provide the literal Sam setup for that route: establish the required keys off camera, install/open the selected AI agent, authenticate it as needed, and install `ai-router`, without mentioning Copilot CLI sign-in.

## NITS

- **Nit:** The checklist repeatedly cites `s3-literal-fidelity-check.md`, but no file with that name exists. The evidence appears to be `s3-authoring-gates.md` and `s3-check-literals.py`. Locations include checklist `Notes`, Walk 5, and Walk 13.
- **Nit:** Walks 9 and 10 stop at Scene 6 Beat 8, so Scene 6 Beat 9 is never performed despite Walk 13’s whole-script framing. It is only closing narration, so the practical impact is small.
- **Nit:** `video/README.md` states the scripts “were dry-run end to end” even though the checklist explicitly says they have not yet been walked. This should be future-tense until Session 4 actually completes the walk.