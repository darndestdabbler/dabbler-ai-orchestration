ISSUES FOUND

### Issue 1: The unexecuted UAT checklist is pre-populated as passing

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Session 4 opens the checklist before performing any walk. Every item already has `"Passes": true`, so checklist consumers cannot distinguish an unexecuted item from a successful one. This is certain in the current artifact and can allow the set’s mandatory acceptance walk to appear complete without evidence.
- **Details:**
  - **Violation:** The checklist states that Session 4 “fills in every `Result` / `Feedback` / `Passes` DURING the walk,” yet all 13 items already claim success before the walk.
  - **Impact:** The acceptance artifact is fail-open. A human or automated completion check that relies on `Passes` sees thirteen successful items even though `Result` and `Feedback` are empty and the checklist explicitly says “NOT YET WALKED.” That materially undermines the set’s central requirement that the new instructions be tested end to end before acceptance.
  - **Evidence:** `106-hello-world-tutorial-simplification-uat-checklist.json` has `"Result": ""`, `"Feedback": ""`, and `"Passes": true` on every review item. `s3-check-checklist.py` only checks that `Passes` is a boolean; it never requires unwalked items to start false.
  - **Correct answer:** Initialize every unwalked item with `"Passes": false` or an explicitly supported unset state, and have Session 4 set it true only after recording the result and feedback.

### Issue 2: The Azure DevOps route repeats the same global-CLI identity failure that was fixed only for GitHub

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A recorder selects the Azure DevOps alternate and then follows the documented rejoin into scenes 3–6 on the prescribed one-machine, two-actor staging. Scene 2 authenticates `az` once as the initial actor. Later scenes switch only `gh`, even though Dabbler uses Azure CLI for an Azure DevOps remote. Sam’s PRs are therefore created under the initial Azure identity; once self-approval is disabled, Priya cannot provide the required independent approval. This is probable for every one-machine recording of the documented ADO route.
- **Details:**
  - **Violation:** The README says an Azure DevOps viewer watches the alternate and then “the main scenes 3–6 with the substitutions each take lists,” while the scene contract requires literal, followable actions. The substitutions do not establish or switch Sam’s Azure DevOps CLI identity.
  - **Impact:** The ADO route can dead-end at the first approval-dependent PR, materially defeating the alternate take’s claimed rejoin into the remaining walkthrough. Walk 11 will not catch this because it explicitly stops at the rejoin point and “never runs a Dabbler session on ADO.”
  - **Evidence:** `scene-2-alt-azure-devops.md` beat 5 performs one global `az login`. `scene-5-second-module.md` stages only two **GitHub** accounts and uses `gh auth login` / `gh auth switch`; `scene-6-pr-and-merge.md` likewise switches only `gh`. The ADO take itself states that Dabbler uses the Azure CLI for pull requests, so those GitHub switches do not control the ADO PR author.
  - **Correct answer:** Script two Azure DevOps identities and an explicit, verifiable identity switch before every ADO PR action—such as per-window PATs or a safe logout/login procedure—or narrow the documented ADO scope and remove the unsupported claim that scenes 3–6 are followable through the listed substitutions.

#### NITS

- **Nit:** `video/README.md` says the scripts “were dry-run end to end by a human,” while the checklist says they are “NOT YET WALKED.” That statement should remain future-tense until Session 4 succeeds.
- **Nit:** Scene 3 calls both GitHub templates “comment-only,” and scene 4 calls the adapted PR run the workflow’s first execution. The scaffolded workflow is already active and is pushed to `main` in scene 3, so both narration claims are false.
- **Nit:** Walk 13 says eight of nine scripts were executed beat by beat, but scenes 1–6 plus the ADO alternate total seven walked scene scripts; the direct-API alternate is only reviewed, and scene 6 beat 9 is not included in Walks 9–10.