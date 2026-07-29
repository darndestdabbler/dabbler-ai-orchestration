ISSUES FOUND

Fix verdict: L1 Marketplace version dependency -- fix-accepted  
Fix verdict: L2 missing approval for lifecycle PR -- fix-accepted  
Fix verdict: L3 incorrect manual CODEOWNERS request -- fix-accepted  
Fix verdict: L4 unconditional empty commit -- fix-accepted  
Fix verdict: L5 CI log omitted module paths -- fix-accepted  
Fix verdict: L6 missing Azure DevOps repository setup -- fix-accepted  
Fix verdict: L7 nonexistent zero-approval selector -- fix-accepted  
Fix verdict: L8 nonexistent personal-repository role selector -- fix-accepted  
Fix verdict: L9 bash-only macOS key probe -- fix-accepted  
Fix verdict: L10 missing Azure CLI installation -- fix-accepted  
Fix verdict: L11 nonliteral AI-agent installation -- fix-accepted  
Fix verdict: L12 contradictory Walk 1 preconditions -- fix-accepted  
Fix verdict: L13 -- duplicate-of L1  
Fix verdict: L14 -- duplicate-of L2  
Fix verdict: L15 -- duplicate-of L10  
Fix verdict: L16 -- duplicate-of L6  
Fix verdict: L17 -- duplicate-of L3  
Fix verdict: L18 missing VS Code version check -- fix-accepted  
Fix verdict: L19 Azure DevOps privacy conflict -- fix-accepted  
Fix verdict: L20 direct-API route incorrectly required Copilot -- fix-accepted  
Fix verdict: L21 -- duplicate-of L6  
Fix verdict: L22 -- duplicate-of L19  
Fix verdict: L23 unavailable local-build dependency for recorders -- fix-accepted  
Fix verdict: L24 missing OBS privacy scene -- fix-accepted  
Fix verdict: L25 unprotected Sam authentication beat -- fix-accepted  
Fix verdict: L26 unexecuted checklist pre-populated as passing -- fix-accepted  
Fix verdict: L27 Azure DevOps CLI identity staging -- fix-rejected

- **Issue 1: The Azure DevOps identity remediation relies on environment-variable propagation that does not occur**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A recorder follows the prescribed one-machine Azure DevOps route and sets each actor’s `AZURE_DEVOPS_EXT_PAT` inside that actor’s VS Code integrated terminal. Sam then invokes **`Dabbler: Open PR for this set`** from the Command Palette. The Dabbler extension runs `az repos pr create` from the VS Code extension host, which cannot inherit an environment-variable change made by its child terminal process. The PAT is therefore unavailable to Dabbler, and `az` falls back to the globally cached identity established by `az login`. Sam’s PR is authored as the initial actor, preventing the required independent approval. This is probable for every one-machine recording that follows the new instructions literally.
  - **Location:** `docs/tutorials/video/scene-2-alt-azure-devops.md`, downstream-change table; `docs/tutorials/video/scene-5-second-module.md`, Azure DevOps staging note; `docs/tutorials/video/scene-6-pr-and-merge.md`, Beat 1.
  - **Details:**
    - **Violation:** Session step 3 requires each beat to have a “literal and copy-pasteable” action. The remediation claims: “give each VS Code window its own `AZURE_DEVOPS_EXT_PAT` … set off camera in that window’s terminal.” A terminal process cannot modify the environment of its already-running parent extension host.
    - **Impact:** The documented ADO rejoin path still dead-ends when Priya must approve a PR created under her own identity. The fix therefore does not resolve L27’s material followability failure.
    - **Evidence:** The scripts explicitly set the PAT in the integrated terminal but open PRs through a Command Palette extension action. In contrast, `gh auth switch` works because it updates shared CLI configuration on disk; a shell-local environment variable is visible only to that shell and its descendants. Walk 11 also stops before any downstream Dabbler PR action, so the checklist would not expose this failure.
  - **Fix:** Use separate machines or OS users for the ADO actors, or start genuinely isolated VS Code processes from shells where each actor’s PAT is already present in the process environment. Alternatively, run the `az repos pr create` action directly from the PAT-scoped terminal and document that departure. Do not claim that setting the variable in an existing integrated terminal changes the identity used by the extension host.