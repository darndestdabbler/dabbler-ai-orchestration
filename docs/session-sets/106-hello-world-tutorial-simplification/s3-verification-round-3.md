ISSUES FOUND

Fix verdict: L1 Marketplace/local-VSIX version handling -- fix-accepted  
Fix verdict: L2 required approval for Sam’s lifecycle PR -- fix-accepted  
Fix verdict: L3 automatic CODEOWNERS review request -- fix-accepted  
Fix verdict: L4 conditional commit after lifecycle sessions -- fix-accepted  
Fix verdict: L5 visible per-module CI log lines -- fix-accepted  
Fix verdict: L6 Azure DevOps repository prerequisites -- fix-accepted  
Fix verdict: L7 GitHub zero-approval control -- fix-accepted  
Fix verdict: L8 personal-repository collaborator flow -- fix-accepted  
Fix verdict: L9 macOS-compatible key-presence probe -- fix-accepted  
Fix verdict: L10 Azure CLI installation -- fix-accepted  
Fix verdict: L11 literal canonical AI-agent installation -- fix-accepted  
Fix verdict: L12 Walk 1 precondition contradiction -- fix-accepted  
Fix verdict: L13 -- duplicate-of L1  
Fix verdict: L14 -- duplicate-of L2  
Fix verdict: L15 -- duplicate-of L10  
Fix verdict: L16 Azure DevOps whole-script verdict coverage -- fix-rejected  
Fix verdict: L17 -- duplicate-of L3  
Fix verdict: L18 VS Code version verification -- accepted-with-modification  
Fix verdict: L19 private Azure DevOps repository privacy conflict -- fix-rejected  
Fix verdict: L20 direct-API setup for Sam -- fix-accepted  

## Issue 1: The checklist still cannot establish that the Azure DevOps take is followable

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Session 4 follows Walk 11 exactly. It creates the project/repository using only beats 1–2 and inspects policy controls, but never performs the alternate take’s clone, Azure CLI installation/authentication, extension setup, or rejoin path. Walk 13 then asks for a whole-script followability verdict without testing those beats. This is certain from the prescribed walk, and it can allow a materially broken alternate take to pass UAT.
- **Location:** `106-hello-world-tutorial-simplification-uat-checklist.json`, Walks 11 and 13.
- **Details:**
  - **Violation:** The checklist says the walk proves scripts are “followable” and Walk 13’s item claims, “Every scene script is followable as written.” Walk 11 expressly remains “a SPOT CHECK” and executes only scene beats 1–2 before inspecting four controls.
  - **Impact:** The operator cannot reach a defensible PASS/FAIL verdict for the Azure DevOps script. In particular, the newly added Azure CLI installation and authentication remediation is never exercised.
  - **Evidence:** Walk 11 omits the clone and CLI beats, while Walk 13 only asks the operator to confirm “every beat you performed”; that wording cannot detect unperformed beats.
  - **Fix:** Have Walk 11 execute the complete alternate scene in its isolated scratch project and clone, including Azure CLI setup and the rejoin point, with expectations for every beat.

## Issue 2: The remediation weakens an explicit privacy requirement instead of satisfying it

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A recorder follows the Azure DevOps take and displays the newly created **Private** project and repository. This happens on every recording performed as written. The result violates the specification’s explicit rule that private repositories must never appear on screen, so the recording cannot satisfy the required OBS privacy contract.
- **Location:** `docs/tutorials/video/README.md`, “What must never be on screen”; `scene-2-alt-azure-devops.md`, Beat 1/privacy note.
- **Details:**
  - **Violation:** The task requires OBS notes covering “what must never be: real tokens, org names, private repos.” The remediation instead says, “The scratch repository itself may be private” and calls the ADO repository “the one repository allowed on screen while private.”
  - **Impact:** The operator may approve and publish a recording that violates a hard deliverable requirement. Changing the README does not amend the governing specification.
  - **Evidence:** The ADO scene still instructs creation with visibility **Private**, while the README now expressly carves out that private repository.
  - **Fix:** Keep the prohibition on displaying private repositories and create a public throwaway Azure DevOps project/repository for the recorded take, or redesign the take so no private repository appears.

## NITS

- **Nit:** The L18 version check is now real and judgeable, but both scene-1 variants recommend **Shell Command: Install 'code' command in PATH** when `code` is missing. That command is the standard macOS remedy and is generally unavailable on Windows, despite the main take using Windows-specific `winget`. Add the Windows remedy—restart after installation or reinstall VS Code with **Add to PATH** enabled.