# ISSUES FOUND

## Issue 1: A recorder is included despite the authoritative verdict being `FAIL`

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/s4-pilot-criteria.json`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-outcome.md`, `tools/dabbler-ai-orchestration/package.json`, `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/obs-capture.js`
- **Failure scenario:** The current tree is merged before an operator grants a waiver. Users then receive and invoke `walkthrough:vscode` even though two fixed criteria failed. This is not hypothetical: the recorder and package entrypoint are already present, the machine verdict is already `FAIL`, and no operator ruling exists.
- **Acceptance criterion:** `JUDGMENT - The tree contains the Windows recorder only if a re-measurement against the unchanged pre-capture criteria returns PASS; otherwise the recorder and its entrypoint are absent and the outcome records deferral.`
- **Details:**
  - **Violation:** The criteria state, `"Any criterion unmet ... is a FAIL. A fail ships no recorder"`, and the plan says, `"Fail → ... defer desktop capture with evidence."`
  - **Impact:** This reverses the session’s central ship/no-ship gate. Calling the implementation “provisional” does not satisfy a contract that permits creation only on a pass, especially when the operator waiver is explicitly still pending.
  - **Evidence:** The committed evaluation reports `"verdict": "FAIL"` with `C2` and `C7` unmet, while `package.json` exposes `walkthrough:vscode` and the full recorder/backend are included.
  - **Fix:** Either remove the recorder and retain only the measurements, or remediate and re-run the pilot until the authoritative verdict is `PASS` before including it.

## Issue 2: The required ffmpeg fallback was never evaluated after OBS failed

- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-os-capture.js`, `tools/dabbler-ai-orchestration/scripts/os-capture-verdict.js`, `tools/dabbler-ai-orchestration/package.json`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-outcome.md`
- **Failure scenario:** The operator receives an OBS-specific `FAIL`, including an OBS-specific audio-track limitation, and must decide whether to defer capture or waive criteria without the promised fallback measurement. This occurs on the current main path because OBS did fail and there is no ffmpeg attempt or documented dependency-absent result.
- **Acceptance criterion:** `JUDGMENT - The durable outcome contains a measured ffmpeg gdigrab verdict against the unchanged criteria, or a recorded clean dependency-absent outcome showing that the optional fallback could not be run.`
- **Details:**
  - **Violation:** The plan identifies `ffmpeg (-f gdigrab)` as the **fallback candidate** and requires whichever backend runs to earn the unchanged criteria.
  - **Impact:** The session does not establish whether OS capture failed generally or only whether this OBS configuration failed. That distinction directly affects the ship/defer decision.
  - **Evidence:** The harness imports and invokes only `recordVscodeWalkthrough` and OBS modules; the measurement names only OBS Studio; neither the package scripts nor outcome contain a gdigrab run.
  - **Fix:** Exercise gdigrab against the fixed criteria after the OBS failure, or record its optional dependency as unavailable instead of silently omitting the fallback.

## Issue 3: Several recording failures abort and delete the walkthrough instead of degrading to no video

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/obs-capture.js`, `docs/walkthroughs/README.md`, `ai_router/changelog.d/0013-set-113-s4-os-capture-pilot.md`
- **Failure scenario:** An extension developer has another matching Extension Development Host, or OBS accepts `StartRecord` but its output does not become active. `configure()` then throws a plain `Error`, or `startRecording()` throws `ObsUnavailableError`; both escape the narrow setup catch, skip all walkthrough steps, set `result.failure`, and cause the normal CLI run to delete the output directory and exit nonzero. Ambiguous development-host windows and OBS output-start failures are explicitly treated by this implementation as real expected conditions, not contrived misuse.
- **Acceptance criterion:** `JUDGMENT - Ambiguous-window refusal and start/stop recording failures still drive every scenario step, finalize the run, write the manifest and index with zero os-video artifacts, and return the documented no-video outcome.`
- **Details:**
  - **Violation:** The implementation and changelog claim, `"FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH"` and that manual-only degradation remains intact.
  - **Impact:** A supported capture refusal or OBS output failure destroys the primary written deliverable instead of merely omitting video.
  - **Evidence:** Only `prepareHost()`, `launch()`, and `configure()` are wrapped by the degradation catch, and that catch handles only `ObsUnavailableError`. Ambiguity is a plain `Error`. `startRecording()` runs afterward and can throw `ObsUnavailableError("output-never-started", ...)`. The outer catch marks the run failed; the `finally` block removes `outDir` when `result.usable` is false and `--keep` was not supplied.
  - **Fix:** Treat all capture-only setup/start/stop failures as degradation after cleanup, while continuing the driver and finalization. Driver or scenario failures should remain real walkthrough failures.

## Issue 4: C6 is reported as passed without its required post-setup induced failure

- **Category:** False Positive
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-os-capture.js`, `tools/dabbler-ai-orchestration/scripts/os-capture-verdict.js`, `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/obs-capture.js`, `docs/session-sets/113-narrated-video-walkthroughs/s4-pilot-criteria.json`, `docs/session-sets/113-narrated-video-walkthroughs/s4-os-capture-measurement.json`
- **Failure scenario:** A likely UI timeout, OBS disconnect, or ambiguity occurs after the temporary scene collection/profile has been created. Cleanup then exercises a materially different path from all measured failures and may leave OBS state behind. The evaluator nevertheless advertises C6 as passed, encouraging shipment based on cleanup evidence that never exercised this state.
- **Acceptance criterion:** `JUDGMENT - The pilot deliberately fails after OBS profile, scene, and input creation, records that induced failure in the measurement, independently verifies every C6 cleanup obligation afterward, and makes C6 fail if any obligation is absent or unchecked.`
- **Details:**
  - **Violation:** C6 requires post-run assertions after `"one deliberately induced mid-run failure"` and says cleanup must hold when the run `"fails part way."`
  - **Impact:** Deterministic restoration of the operator’s OBS state is a pass criterion and a privacy/safety boundary. A false C6 pass changes whether the recorder is eligible to ship.
  - **Evidence:** `measurement.inducedFailure` is `null`. The three substitutes fail before `configure()` has completed: executable absence fails immediately, unreachable websocket fails before configuration, and authentication rejection fails before scene/profile/input creation. The evaluator ignores `inducedFailure` and labels all dependency variants “part-way failures” solely because their `cleanupProblems` arrays are empty. The outcome separately admits that the ambiguity cleanup fix landed after capture and was not measured.
  - **Fix:** Add a deterministic failure injection after configuration, verify process/config/profile/scene/temp-file restoration externally, and make the evaluator require that evidence rather than equating every dependency failure with the required mid-run case.

## NITS

- **Nit:** `os-capture-verdict.js` counts supplementary runs toward the ten-run bar but excludes them from C1–C4, C6, and C7 evaluation. It also counts clean runs rather than enforcing consecutiveness. A supplementary wrong-window or leaking recording can therefore satisfy the numerical bar if it has a video and completed steps.
- **Nit:** C7 says every captured window must belong to a harness-owned PID, but `record-vscode-walkthrough.js` matches only executable/title text, never uses the recorded PID, and `os-capture-verdict.js` does not evaluate `everyCapturedWindowOwnedByHarness`.
- **Nit:** C6’s evaluator trusts `cleanupProblems` instead of checking all fixed requirements. VS Code process termination, zero-byte/temp-file absence, and byte-for-byte restoration are not verified by the shown code. The unavailable-OBS cleanup path also swallows a thrown `session.cleanup()` and can report an empty problem list.
- **Nit:** The documents repeatedly call the audio track “provably silent,” but the implementation only establishes that no OBS inputs or special inputs were listed. It never decodes or measures the audio samples, so contentless audio is plausible but not proved.
- **Nit:** `prepareHost()` removes pre-existing OBS sentinel files and never restores them. `_removeAppeared()` also removes every scene/profile filesystem entry created during the run, including an entry an concurrently running operator OBS instance could create. Both contradict the broad claim that the operator’s OBS is restored exactly, although those scenarios are uncommon.
- **Nit:** A pre-existing profile named `dabbler-walkthrough-profile` is treated as created by the harness and removed during cleanup; a same-named scene collection is reused and has all of its inputs removed. Fixed names therefore make a rare collision destructive.
- **Nit:** The fixed C3 instrument says it uses DPI-aware Win32 `GetClientRect`, while the implementation uses Electron `getContentBounds()` multiplied by `screen.scaleFactor`. They are equivalent on the measured 100% setup but are not the instrument the criteria specify.
- **Nit:** `validateDriverBlock()` does not substantiate its claim that driver-block typos are refused. It checks step presence and two selectors, but accepts missing `rowText`, misspelled action keys, unknown click values, and malformed `then`/`expect` structures.
- **Nit:** Stamping the current criteria SHA-256 into a measurement proves which criteria content was evaluated, not by itself that the file was committed before the first capture. Commit history or another append-only timestamped record is needed for the stronger ordering claim.