ISSUES FOUND

### Issue 1: The central container experiment substituted ffmpeg for OBS and stock VS Code for the extension, contrary to the plan

- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/spec.md`, `tools/dabbler-ai-orchestration/containers/Containerfile.capture-base`, `tools/dabbler-ai-orchestration/containers/run-capture.sh`, `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-outcome.md`
- **Failure scenario:** A reviewer relies on this session to decide that the planned OBS/VS Code capture stack can be isolated. The actual experiment cannot support that decision: OBS, its OpenGL/headless behavior, the Dabbler extension, and the existing Layer 3 machinery were never exercised. This is probable rather than hypothetical because those are the exact components the plan names, while the outcome expressly labels both OBS and the extension unmeasured.
- **Acceptance criterion:** `JUDGMENT - The measurement must run OBS and the Dabbler extension in VS Code on the container’s virtual display through the existing Layer 3 machinery, or the plan must have an operator-authorized amendment that explicitly changes those obligations before the substituted experiment is treated as satisfying Session 5.`
- **Details:**  
  - **Violation:** Step 5 requires: *“VS Code and OBS on a virtual display inside Podman, driven by the existing Layer 3 machinery”* and names `ai_router/podman_sandbox.py` under **Touches**.  
  - **Impact:** The session’s principal merge decision—whether the declared capture dependencies can be isolated—is left unanswered for OBS and for the actual extension. OBS may fail under headless OpenGL, and the extension may fail under Linux software rendering; the outcome itself acknowledges both unknowns.  
  - **Evidence:** The image installs `code` and `ffmpeg`, but not OBS. `run-capture.sh` opens stock VS Code on `$HOME`; it neither installs nor launches the extension. `measure-container-isolation.js` is a bespoke Podman driver and does not use `ai_router/podman_sandbox.py` or walkthrough Layer 3. The outcome explicitly states *“OBS was not run inside the container”* and *“The Dabbler extension was not installed in the container.”* An AI-authored `goal-over-letter` journal entry does not discharge an explicit operator-approved session plan.

### Issue 2: Criterion I5 is reported PASS without exercising the required walkthrough degradation behavior

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-verdict.json`
- **Failure scenario:** On a machine where Podman is absent, stopped, or lacks the image—a common first-run or degraded-dependency state—the real walkthrough may abort, omit its manifest, or leave a video artifact. The current tests cannot detect any of those failures because they invoke isolated Podman commands rather than the walkthrough entrypoint. Dependency absence is explicitly expected by the criterion, making this scenario probable.
- **Acceptance criterion:** `JUDGMENT - Each exact I5 variant must drive the real walkthrough/container-capture entrypoint and prove that it completes, writes its manifest, emits zero video artifacts, and names the missing dependency; the verdict must reject missing, duplicate, renamed, or substituted variants unless the criteria were amended before measurement.`
- **Details:**  
  - **Violation:** I5 requires *“the walkthrough still completes without a video”* and mandates `errorMentionsContainerDependency`, `manifestStillWritten`, and `videoArtifactCount: 0` for the declared variants `podman-executable-absent`, `podman-machine-stopped`, and `image-absent`.  
  - **Impact:** The machine verdict falsely certifies the set’s cardinal degradation guarantee—*“FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH”*—without testing it. This can directly ship a capture integration that breaks walkthrough completion on ordinary dependency failures.  
  - **Evidence:** `inducedVariants()` only runs `podman ps` or `podman run`; it never invokes a walkthrough, reads a manifest, or counts video artifacts. The stopped-machine variant is replaced by an invalid connection name, which fails during CLI argument/connection lookup rather than exercising an unreachable or stopped machine. The scorer merely checks that the number of records is at least three and that each has any nonempty message; it does not verify exact variant identities or any required postconditions.

### Issue 3: Criterion I6 is reported PASS without the required failure-path and filesystem cleanup checks

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-verdict.json`
- **Failure scenario:** A Podman copy failure, malformed PNG, interrupted ffmpeg run, or other mid-run exception leaves the container or headed host marker alive because cleanup is not protected by `finally`. Such failures are probable in this multi-process, explicitly unstable measurement path, which already encountered multiple instrumentation and Podman failures during the session.
- **Acceptance criterion:** `JUDGMENT - The harness must induce a real mid-run failure and prove, for successful and failed runs, that containers, harness-created volumes, host marker processes, temporary files, and zero-byte outputs are cleaned while the Podman machine is restored to its entry state; cleanup must execute through a guaranteed failure path.`
- **Details:**  
  - **Violation:** I6 requires post-run assertions *“after every run and after one deliberately induced mid-run failure”*, including `noZeroByteOrTempFilesInRunDir`.  
  - **Impact:** The PASS overstates deterministic cleanup and can leave operator-visible processes, containers, and partial artifacts after exactly the failures the criterion was intended to cover. This materially undermines the isolation harness’s safety and repeatability.  
  - **Evidence:** No mid-run failure is induced. Neither the measurement nor scorer checks zero-byte or temporary files. `oneRun()` closes the marker and removes the container only on the normal control flow; decoding or other exceptions before those statements bypass cleanup. The verdict checks only removal statuses, a global volume count, and a boolean machine-state comparison.

### Issue 4: The mandatory cost record is incomplete and contradicts the reported outcome

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-verdict.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-outcome.md`
- **Failure scenario:** An operator deciding whether the isolation cost is acceptable receives incompatible build and run numbers and no cold-start measurement. Every reader making the session’s required cost/fidelity decision encounters this ambiguity, so the consequence is on the main path rather than an edge case.
- **Acceptance criterion:** `JUDGMENT - A regenerated raw measurement, verdict, and outcome must agree on image build time and per-run wall time and must explicitly contain every I7-required field, including cold-start and capture wall-clock measurements, with warm versus cold conditions identified.`
- **Details:**  
  - **Violation:** I7 requires `imageBytes`, `imageBuildSeconds`, `coldStartSeconds`, and `captureWallClockSeconds` to be present, while the session must end with a measured answer about what isolation costs.  
  - **Impact:** The cost half of the session’s decision is not reproducible or trustworthy, and the machine verdict silently ignores an unmet predeclared requirement. This changes whether a reviewer can accept the stated recommendation.  
  - **Evidence:** The raw measurement and generated verdict report `imageBuildSeconds: 1.5`, but the outcome table says **46.5 s warm build**. Target runs are recorded as **29.5 s**, while the outcome says approximately **40 s per run**. There is no `coldStartSeconds` field, and I7’s verdict merely copies `m.cost` without validating required fields. The raw note explicitly says the cold build was not measured.

## NITS

- **Nit:** `container-isolation-verdict.js` ignores `target_process_count`, `mapped_window_count`, and `mapped_window_names`. A nonblack error window could therefore satisfy I2 even when VS Code itself did not start; the current measurement happens to contain process and window evidence, so this is primarily future false-pass hardening.
- **Nit:** I1 declares forbidden environment names, but neither the structural record nor verdict checks them. The current fixed run command supplies no environment flags, limiting present impact.
- **Nit:** `openHostMarker()` calls Playwright’s `bringToFront()` but records no OS-level proof that the marker remained foreground for the full synchronous Podman run. The outcome’s categorical claim that it was *“genuinely in front”* is stronger than the retained evidence.
- **Nit:** `measure-obs-plugin-surface.js` deletes every file in OBS’s `.sentinel` directory before and after each launch, including while `--multi` permits another OBS instance to be active. This mutates operator-owned crash/safe-mode state unnecessarily.
- **Nit:** The cleanup volume count measures all Podman volumes, not volumes created by this harness. A machine with unrelated existing volumes would fail I6 even if this run cleaned up correctly.
- **Nit:** `run-capture.sh` still says `<outdir>` is *“the one bind-mounted path”*, while the actual harness deliberately uses zero bind mounts and extracts artifacts with `podman cp`.
- **Nit:** `session-progress.json` predates the measurements and still presents Steps 2–9 as pending or in progress. This is not missing close-out state, but it is stale derived documentation in the reviewed tree.