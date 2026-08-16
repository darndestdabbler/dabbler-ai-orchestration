ISSUES FOUND

Fix verdict: L1 recorder remains directly executable and documented despite FAIL -- fix-rejected  
Fix verdict: L2 ffmpeg fallback was measured and conclusively disqualified by C1 -- accepted-with-modification  
Fix verdict: L3 setup, start, and stop capture failures now degrade without destroying the walkthrough -- fix-accepted  
Fix verdict: L4 C6 now requires measured post-setup failure and cleanup evidence -- fix-accepted  
Fix verdict: L5 -- duplicate-of L1  
Fix verdict: L6 -- duplicate-of L3  
Fix verdict: L7 recorder no longer enables obs-websocket without explicit pilot opt-in -- fix-accepted  
Fix verdict: L8 -- duplicate-of L4  
Fix verdict: L9 supplementary recordings are now evaluated with the primary recordings -- fix-accepted  
Fix verdict: L10 -- duplicate-of L2

### Issue 1: The failed recorder remains a documented, user-invocable capability

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `docs/walkthroughs/README.md`, `docs/session-sets/113-narrated-video-walkthroughs/s4-uat-walk.md`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-outcome.md`
- **Failure scenario:** An internal developer follows the exact command in the general walkthrough README or UAT guide while the authoritative verdict remains `FAIL`. `announceStatus()` prints a warning but then unconditionally calls `recordVscodeWalkthrough(options)`, so capture proceeds without a pass or operator waiver. This is probable because both documents explicitly instruct users to invoke that command; removing only the npm alias does not enforce the release gate.
- **Acceptance criterion:** `JUDGMENT - With the committed verdict at FAIL and no committed operator waiver, every documented or directly user-invocable recorder entrypoint must refuse capture; pilot-only imports needed to retain or reproduce measurements may remain.`
- **Details:**
  - **Violation:** The contract says, “Fail → keep the measurements as the durable deliverable … and defer desktop capture,” and that the session creates an optional recorder “only on a pass.” The remediation also claims, “Nothing ships.”
  - **Impact:** The operator’s decision right remains advisory rather than enforced. Merging this tree still provides and documents an executable recorder that the fixed criteria disqualified, which changes the reasonable merge decision for a pass-gated capability.
  - **Evidence:** `announceStatus()` returns after logging for every non-PASS state; it does not throw, set a failure code, or prevent the subsequent recorder invocation. Both README and UAT documentation publish the direct `node scripts/record-vscode-walkthrough.js` command.
  - **Fix:** Fail closed in `main()` unless the committed evaluation is `PASS` or contains a committed operator waiver. Keep measurement-only access as a non-user-facing import or explicit pilot harness path, and remove the general recorder command from documentation until approval.

### NITS

- **Nit:** The ffmpeg remediation checks only C1, C2, C3, and C7 rather than all seven criteria or the ten-run bar. C1’s uniformly black output conclusively rejects this backend, so the omission does not undermine the fallback decision, but the outcome should describe it as an early decisive failure rather than measurement against the complete criteria.
- **Nit:** The induced `stop` failure is thrown before `capture.stopRecording()` runs. It verifies the surrounding catch/cleanup path but not a stop operation that fails after partial OBS-side effects, despite prose claiming failure was induced after each operation.
- **Nit:** `measure-ffmpeg-fallback.js` does not regenerate the committed measurement’s `frameContent` or `evaluation` sections. The documented reproduction command therefore reproduces the raw observations, not the complete cited record.