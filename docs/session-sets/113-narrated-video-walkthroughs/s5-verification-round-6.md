ISSUES FOUND

Fix verdict: L1 OBS and extension are now exercised, but Layer 3 reuse remains partial -- accepted-with-modification  
Fix verdict: L2 walkthrough degradation remains self-certified -- fix-rejected  
Fix verdict: L3 failure-path cleanup and filesystem checks -- fix-accepted  
Fix verdict: L4 mandatory cost record -- fix-accepted  
Fix verdict: L5 -- duplicate-of L1  
Fix verdict: L6 -- duplicate-of L2  
Fix verdict: L7 -- duplicate-of L3  
Fix verdict: L8 -- duplicate-of L4  
Fix verdict: L9 isolated OBS plugin probe configuration -- fix-accepted  
Fix verdict: L10 -- duplicate-of L2  
Fix verdict: L11 interruption now occurs during artifact production -- fix-accepted  
Fix verdict: L12 capture activity is observed and the host marker participates -- fix-accepted  
Fix verdict: L13 shared Podman workloads are inventoried and protected -- fix-accepted  

### Issue 1: I5 still certifies the post-capture walkthrough step by writing the assertion itself

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`
- **Failure scenario:** Podman is absent, stopped, or the image is unavailable—ordinary first-run and degraded-dependency states. The entrypoint writes `postCaptureStep: "ran"` without executing or observing a distinct post-capture walkthrough operation, and the parent converts that same field directly into `postCaptureStepRan: true`. I5 therefore passes even though the behavior it claims to protect remains untested. This is probable because all three declared variants deterministically use this self-reporting path.
- **Acceptance criterion:** `JUDGMENT - Each I5 variant must execute a distinct, externally observable post-capture walkthrough action through the documented entrypoint, and the parent must derive postCaptureStepRan from that action's result or artifact rather than from a manifest field that the degraded catch path assigns unconditionally.`
- **Details:**  
  - **Violation:** The implementation states that “the acceptance criterion asks that a post-capture walkthrough step still EXECUTES,” but the degraded path only calls `writeManifest(... postCaptureStep: "ran")`; no separate walkthrough action establishes that claim.  
  - **Impact:** A reviewer is still given a false PASS for the cardinal guarantee that recording failure does not prevent the rest of the walkthrough. This repeats the substantive false-certification problem behind L2/L6 and leaves the Round 3 L10 remediation incomplete.  
  - **Evidence:** `runVariant()` computes `postCaptureStepRan` solely from `manifest.postCaptureStep === "ran"`, and `container-isolation-verdict.js` trusts that Boolean. The producer and verifier therefore consume the same unsubstantiated declaration. The fix is to perform an actual downstream step and verify its independently produced effect.

### NITS

- **Nit:** The plan says the run is “driven by the existing Layer 3 machinery,” but `measure-container-isolation.js` reimplements the Podman driver and reuses only policy ideas from `ai_router/podman_sandbox.py`. The isolation experiment is otherwise materially completed, so this is the residual attached to L1.
- **Nit:** `s5-isolation-outcome.md` says the interrupted run was removed at 22 seconds, while the committed measurement records 25 seconds.
- **Nit:** `s5-isolation-outcome.md` says the extension “activates” under “Still not proven,” despite nearby text correctly stating that installation and mapped windows do not establish activation.
- **Nit:** Marker focus is recorded but not included in the I1/I6 pass expressions. The current measurement records `hasFocus: true`, so it does not invalidate this run, but future unfocused runs could still be scored.