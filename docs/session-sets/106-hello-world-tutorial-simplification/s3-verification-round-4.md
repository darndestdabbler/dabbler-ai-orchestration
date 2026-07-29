ISSUES FOUND

Fix verdict: L1 Marketplace fallback still assumes an obtainable local VSIX -- fix-rejected  
Fix verdict: L2 required approval is now explicitly performed -- fix-accepted  
Fix verdict: L3 CODEOWNERS automatic review request is now correctly expected -- fix-accepted  
Fix verdict: L4 post-session commit is now conditional on a dirty worktree -- fix-accepted  
Fix verdict: L5 CI now emits observable module paths -- fix-accepted  
Fix verdict: L6 Walk 11 now creates the required Azure DevOps project and repository -- fix-accepted  
Fix verdict: L7 zero approvals is now represented by an unticked checkbox -- fix-accepted  
Fix verdict: L8 personal-repository invitation no longer requires a nonexistent role selector -- fix-accepted  
Fix verdict: L9 the key probe now works in both bash and zsh -- fix-accepted  
Fix verdict: L10 the Azure DevOps take now installs and verifies Azure CLI -- fix-accepted  
Fix verdict: L11 the direct-API take now names a canonical agent and literal installation flow -- fix-accepted  
Fix verdict: L12 Walk 1 preconditions no longer require preinstallation or preauthentication -- fix-accepted  
Fix verdict: L13 -- duplicate-of L1  
Fix verdict: L14 -- duplicate-of L2  
Fix verdict: L15 -- duplicate-of L10  
Fix verdict: L16 Walk 11 now executes the Azure DevOps take rather than merely inspecting controls -- fix-accepted  
Fix verdict: L17 -- duplicate-of L3  
Fix verdict: L18 both scene-1 takes now execute and judge a VS Code version check -- fix-accepted  
Fix verdict: L19 the Azure DevOps take now uses a public scratch project -- fix-accepted  
Fix verdict: L20 Sam’s direct-API setup is now explicitly substituted downstream -- fix-accepted  
Fix verdict: L21 -- duplicate-of L16  
Fix verdict: L22 -- duplicate-of L19  

## Issue 1: The Marketplace-version remediation replaces one unavailable dependency with another

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Before extension 0.46.0 is published, a future recorder follows either scene-1 take. The required Marketplace check reports 0.45.0, so the script directs them to install “the local build.” Unlike the Session 4 operator, that recorder has no stated prerequisite, location, download, or build command for a 0.46.0 VSIX. Because the release contract explicitly leaves publication operator-gated, this is the expected current state rather than an unusual edge case. The recorder must stop or invent an acquisition/build procedure, so the scene remains unperformable as written.
- **Location:** `docs/tutorials/video/scene-1-install-and-verify.md`, Beat 2; `docs/tutorials/video/scene-1-alt-direct-api.md`, Beat 2.
- **Details:**
  - **Violation:** The task requires each beat to provide a “literal and copy-pasteable” on-screen action from its declared starting state. Both fixes say to “install the local build” via **Install from VSIX**, but neither establishes that the VSIX exists or tells the recorder how to obtain or build it.
  - **Impact:** The flagship scene and direct-API alternate still cannot be recorded from their documented starting state while Marketplace remains on 0.45.0. This directly impairs the session’s primary script-followability objective.
  - **Evidence:** The checklist separately adds a Session 4 precondition requiring “a LOCAL BUILD … present as a .vsix,” proving that the UAT operator receives state the scene scripts themselves do not establish. The release contract confirms 0.46.0 has not been published.
  - **Fix:** Add the 0.46.0 VSIX as an explicit starting-state prerequisite with a stable acquisition path, or provide literal build commands and the resulting file location. Alternatively, make Marketplace publication a hard prerequisite and instruct recorders not to record until Marketplace is at least 0.46.0.

## NITS

- **Nit:** Walk 13 says “Eight of the nine scripts were executed beat by beat,” but scenes 1–6 plus the Azure DevOps alternate total seven scene scripts. There are eight scene scripts overall; the ninth markdown file is the README and has no beats. The following enumeration states the correct scope, so this is non-blocking.