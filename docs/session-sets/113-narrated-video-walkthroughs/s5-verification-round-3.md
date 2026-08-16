ISSUES FOUND

Fix verdict: L1 OBS and extension substitution replaced with measured real attempts -- accepted-with-modification  
Fix verdict: L2 degradation behavior is tested only through a synthetic helper, not the documented entrypoint -- fix-rejected  
Fix verdict: L3 induced failure occurs after successful capture and is incorrectly counted as a clean run -- fix-rejected  
Fix verdict: L4 required cost fields are present, with small residual reporting inconsistencies -- accepted-with-modification  
Fix verdict: L5 -- duplicate-of L1  
Fix verdict: L6 -- duplicate-of L2  
Fix verdict: L7 -- duplicate-of L3  
Fix verdict: L8 -- duplicate-of L4  
Fix verdict: L9 live OBS configuration is avoided, with residual cleanup defects -- accepted-with-modification  

- **Issue 1:** I5 still does not exercise degradation through the documented container-measurement entrypoint
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js, docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-outcome.md`
  - **Failure scenario:** An operator runs the documented `measure-container-isolation.js` command while Podman is missing, stopped, or otherwise unavailable—the exact first-run and degraded-dependency states declared by I5. `main()` reaches `buildImage()`, which throws on the failed Podman build before the synthetic `containerCaptureEntrypoint()` variants run or the measurement is written. The actual documented workflow therefore aborts without its manifest, despite I5 reporting PASS. This is probable because unavailable Podman and a stopped machine are two of the three explicitly required variants.
  - **Acceptance criterion:** `JUDGMENT - With each declared missing-Podman variant applied to the documented measure-container-isolation.js entrypoint itself, the process completes normally, writes the real walkthrough manifest with a container-dependency explanation, emits no video artifact, and executes a post-capture walkthrough step.`
  - **Details:** **Violation:** I5 requires that “the walkthrough still completes without a video,” but `inducedVariants()` invokes a private helper that always sets `manifest.completed = true`; it does not invoke the documented script under the broken dependency. **Impact:** The PASS cannot support the session’s cardinal degradation guarantee, so a reviewer cannot approve the result as evidence that recording failure leaves the walkthrough usable. **Evidence:** `containerCaptureEntrypoint()` is called only by `inducedVariants()` after image building and normal runs have already succeeded. Conversely, `buildImage()` throws on a nonzero Podman result, and `main()` has no degradation wrapper that writes the promised manifest. The fix must inject each failure into the real entrypoint rather than a self-certifying test helper.

- **Issue 2:** I6’s “mid-run failure” is injected only after capture, copying, decoding, and track analysis have succeeded
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js, tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js, docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json, docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-verdict.json`
  - **Failure scenario:** A normal capture interruption or partial-artifact failure occurs while Podman or artifact production is active. The remediation provides no equivalent test of that state: its exception is thrown only after the container has exited and complete artifacts have been copied and analyzed. Partial files and active-process teardown therefore remain unverified, while the verdict reports I6 PASS and counts the same error-marked run as the third clean run. Such interruptions are probable in the multi-process OBS/ffmpeg/Podman path and were the failure class I6 was created to cover.
  - **Acceptance criterion:** `JUDGMENT - The measurement contains three separate consecutive clean target runs plus a distinct run interrupted while capture or artifact production is active, excludes that interrupted run from the clean-run count, and verifies removal of its container, marker, temporary files, zero-byte files, and partial artifacts.`
  - **Details:** **Violation:** I6 requires cleanup “after one deliberately induced mid-run failure,” while the run bar requires “three consecutive clean runs.” In `oneRun()`, the induced exception is raised only after `podman run`, all three `podman cp` calls, `analyseRun()`, and `readTracks()` have completed. **Impact:** The PASS overstates both failure-path coverage and the clean-run count, materially weakening the isolation result a reviewer is being asked to accept. **Evidence:** Measurement run index 3 contains complete capture facts, frames, analysis, tracks, `inducedMidRunFailure: true`, and an `error`; nevertheless, `s5-isolation-verdict.json` reports `cleanRunsObserved: 3`. The failure run must be separate and interrupted before successful artifact completion.

## NITS

- **Nit:** The OBS remediation claims its main window was successfully unmapped, but every OBS target record has `obs_main_window_mapped: "1"` and `mapped_window_names_during_capture` includes `OBS 30.2.3.1-3`. Because the outcome already reports OBS as failing I2, this does not create another blocker, but the explanation that only an unexplained correlation disagreement remains is unsupported.
- **Nit:** `container-isolation-verdict.js` records `dabblerExtensionInstalled` but does not include `extensionInstalled` in I2’s `pass` expression. The current measurement does contain the extension, but the claimed assertion is fail-open on later runs.
- **Nit:** The outcome cost table reports 55.7 seconds cold build, 23.5 seconds cold start, and 13 seconds capture, while the current measurement reports 57.2, 24.6, and 12 seconds. The OBS measurement also labels a 2.4-second cached rebuild as cold despite the corrected code and prose acknowledging that `podman rmi` alone is insufficient.
- **Nit:** `seedIsolatedConfig()` creates `profiles/dabbler-plugin-probe` before taking the profile-directory snapshot. Consequently, `removeIsolatedConfig()` never treats that profile as newly created; the measurement confirms `profilesRemoved: []`. A pre-existing same-named profile or scene can also be overwritten without backup.
- **Nit:** The plugin probe records `liveSourceKindsSeenInLog` and `isolatedCollectionUsed` but does not make `ok` fail when either safety assertion fails. Current evidence shows the safe values, so this is residual fail-open hardening rather than a current L9 rejection.