ISSUES FOUND

### Issue 1: Scene 5 records Sam’s GitHub CLI authentication without switching to the required privacy scene

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Every one-machine recording follows Scene 5 Beat 3 and runs `gh auth login` for Sam. The command can display a device code or authentication page, but the beat never instructs the recorder to switch OBS to `Privacy`. A recorder following the script literally therefore captures credential-sensitive material or must improvise. This is probable because adding Sam’s second CLI account is now mandatory for the remediated PR flow.
- **Location:** `docs/tutorials/video/scene-5-second-module.md`, Beat 3; `docs/tutorials/video/README.md`, OBS privacy instructions.
- **Details:**
  - **Violation:** The README claims, “Every beat that touches a credential names the `Privacy` scene by name,” and the task requires literal, followable OBS privacy actions. Scene 5 Beat 3 adds `gh auth login` and says to sign in as Sam, but never names or switches to `Privacy`.
  - **Impact:** A future recorder cannot perform the newly added authentication beat safely as written, undermining the session’s explicit credential/privacy objective and potentially causing the final privacy attestation to fail.
  - **Evidence:** Other authentication beats explicitly say to switch to `Privacy`; the newly added Scene 5 command block only runs `gh auth login` and `gh auth status`.
  - **Fix:** Add `Privacy` to Scene 5’s declared OBS scenes. In Beat 3, instruct the recorder to switch to `Privacy` before `gh auth login`, complete authentication, and switch back only after the device code or sign-in page is gone.

Fix verdict: L1 Marketplace version path -- fix-accepted  
Fix verdict: L2 Sam lifecycle PR approval -- fix-accepted  
Fix verdict: L3 automatic CODEOWNERS request -- fix-accepted  
Fix verdict: L4 conditional post-session commit -- fix-accepted  
Fix verdict: L5 visible per-module CI paths -- fix-accepted  
Fix verdict: L6 Azure DevOps repository prerequisites -- fix-accepted  
Fix verdict: L7 zero-approval GitHub control -- fix-accepted  
Fix verdict: L8 personal-repository collaborator flow -- fix-accepted  
Fix verdict: L9 portable macOS/Linux key probe -- fix-accepted  
Fix verdict: L10 Azure CLI installation -- fix-accepted  
Fix verdict: L11 canonical direct-API agent installation -- fix-accepted  
Fix verdict: L12 Walk 1 preconditions -- fix-accepted  
Fix verdict: L13 -- duplicate-of L1  
Fix verdict: L14 -- duplicate-of L2  
Fix verdict: L15 -- duplicate-of L10  
Fix verdict: L16 Azure DevOps whole-take coverage -- fix-accepted  
Fix verdict: L17 -- duplicate-of L3  
Fix verdict: L18 VS Code version check -- fix-accepted  
Fix verdict: L19 Azure DevOps privacy contract -- fix-accepted  
Fix verdict: L20 direct-API setup for Sam -- fix-accepted  
Fix verdict: L21 -- duplicate-of L16  
Fix verdict: L22 -- duplicate-of L19  
Fix verdict: L23 unavailable local-build dependency -- fix-accepted  
Fix verdict: L24 configured OBS privacy scene -- fix-accepted