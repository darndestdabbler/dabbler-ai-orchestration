ISSUES FOUND

## Issue 1: The required OBS/Layer-3 container path was replaced with a materially different experiment

- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/containers/Containerfile.capture-base`, `tools/dabbler-ai-orchestration/containers/run-capture.sh`, `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-outcome.md`
- **Failure scenario:** Every run deterministically starts stock VS Code and captures it with `ffmpeg x11grab`; OBS, the Dabbler extension, and the existing Layer 3 machinery are never used. An operator therefore cannot use the PASS to decide that the requested OBS-based capture dependency or extension workflow works inside the isolation boundary. This is certain on the current path, not an unusual edge case.
- **Acceptance criterion:** `JUDGMENT - Does the run-of-record measurement launch OBS and the Dabbler extension through the existing Layer 3 machinery inside the container, or present an operator-approved amendment made before measurement that explicitly replaces that requirement?`
- **Details:**
  - **Violation:** Step 5 requires: **“VS Code and OBS on a virtual display inside Podman, driven by the existing Layer 3 machinery.”**
  - **Impact:** The session’s principal integration question remains unanswered. The recorded PASS applies to a smaller, stock-VS-Code/ffmpeg rig, so it cannot support a merge or close decision for the specified OBS-based container path.
  - **Evidence:** The Containerfile installs ffmpeg and VS Code but not OBS. `run-capture.sh` starts stock `code` and ffmpeg directly. The outcome explicitly admits: **“OBS was not run inside the container”** and **“The Dabbler extension was not installed in the container.”**
  - **Fix:** Run and measure the specified integrated stack, or obtain an explicit operator-authorized plan amendment before taking replacement measurements. An AI-authored post hoc deviation journal does not establish completion of the original requirement.

## Issue 2: I5 passes without testing the failure behavior that I5 requires

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`
- **Failure scenario:** A missing Podman executable, machine, or image can prevent the actual walkthrough from writing its manifest or can leave a partial video, yet the scorer still reports I5 PASS because it only requires three failed commands with nonempty messages. This happens for every current induced variant: none runs the walkthrough or records the manifest/video assertions.
- **Acceptance criterion:** `python -c "assert (lambda c,m: set(v['variant'] for v in m.get('inducedVariants',[]))==set(c['criteria']['I5']['variants']) and all(v.get('errorMentionsContainerDependency') is True and v.get('manifestStillWritten') is True and v.get('videoArtifactCount')==0 for v in m.get('inducedVariants',[])))(__import__('json').load(open('docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json')),__import__('json').load(open('docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json')))"`
- **Acceptance expectation:** exit 0
- **Details:**
  - **Violation:** I5 requires each variant to establish `errorMentionsContainerDependency`, `manifestStillWritten`, and `videoArtifactCount: 0`, with **“the walkthrough still completes without a video.”**
  - **Impact:** The session’s fail-open degradation guarantee is unproved while the machine verdict claims it passed. This changes the merge decision because dependency failure is a normal operational path for an optional container backend.
  - **Evidence:** `inducedVariants()` invokes Podman commands directly and records only `failed` and `message`. The verdict checks only `ran >= declared && allFailedClearly`. It neither invokes a walkthrough nor checks a manifest or video count. It also accepts any three variants instead of matching the declared names; the measurement substitutes `podman-machine-unreachable` for the declared `podman-machine-stopped`.
  - **Fix:** Drive the real walkthrough entrypoint under each declared failure, record all three required outcomes, require exact declared-variant identity, and score each required field fail-closed.

## Issue 3: I6 is marked PASS without the required interrupted-run test or full cleanup assertions

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`
- **Failure scenario:** If capture is interrupted or artifact decoding throws, `oneRun()` exits before reaching `podman rm -f`, because cleanup is placed after artifact copying and analysis rather than in `finally`. Interrupted capture and partial artifacts are precisely the ordinary failure modes I6 was created to test, so leaving a container or temporary output behind is plausible rather than hypothetical.
- **Acceptance criterion:** `JUDGMENT - Does the measurement deliberately induce a mid-run failure, prove container/volume/file cleanup after that failure and every normal run, and does the implementation guarantee cleanup through finally-style handling on every exit path?`
- **Details:**
  - **Violation:** I6 requires post-run assertions **“after every run and after one deliberately induced mid-run failure”**, including `noZeroByteOrTempFilesInRunDir`.
  - **Impact:** The PASS gives false confidence about deterministic cleanup. A failed recording can leave a container or partial artifacts even though the published verdict says this behavior was measured.
  - **Evidence:** No mid-run failure is induced or recorded. `oneRun()` performs decoding and track inspection before container removal and has no `try/finally`. The verdict checks only container removal status, a volume count, and machine-state equality; it never checks zero-byte or temporary files.
  - **Fix:** Add a real mid-run interruption, move cleanup into guaranteed exit handling, record every I6 requirement for both successful and failed runs, and make missing cleanup evidence fail the verdict.

## Issue 4: The required cost measurement is incomplete and the reported numbers contradict the raw record

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/measure-container-isolation.js`, `tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-criteria.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-container-isolation-measurement.json`, `docs/session-sets/113-narrated-video-walkthroughs/s5-isolation-outcome.md`
- **Failure scenario:** Every reader of the outcome receives a 46.5-second “warm build” figure while the run-of-record JSON says 1.5 seconds, and receives no cold-start measurement despite that being a preset required field. The operator’s “is the container worth its cost?” decision is therefore based on contradictory and incomplete evidence on every reading of this result.
- **Acceptance criterion:** `JUDGMENT - Does the run-of-record contain every preset I7 field, including an actually measured cold-start value, and do all cost figures in the outcome exactly reconcile with the raw measurement and clearly distinguish build, startup, target readiness, recording duration, and total wall clock?`
- **Details:**
  - **Violation:** I7 requires `imageBytes`, `imageBuildSeconds`, `coldStartSeconds`, and `captureWallClockSeconds` to be present. The session charter also says to **“measure what it costs.”**
  - **Impact:** Cost is half of the session’s requested answer and feeds the operator’s adoption decision. A materially inconsistent report cannot support close-out even if cost is intentionally non-thresholded.
  - **Evidence:** The measurement has no `coldStartSeconds`. It records `imageBuildSeconds: 1.5`, while the outcome reports **“46.5 s warm build.”** Target run wall clocks are 29.5 seconds, while the outcome reports approximately 40 seconds per run. The scorer simply copies `m.cost` and never validates I7’s required fields.
  - **Fix:** Measure the missing timing dimensions, remove the hardcoded claim that every invocation is warm, validate required I7 fields, and generate or reconcile the prose table from the run-of-record values.

## NITS

- **Nit:** `container-isolation-verdict.js` does not enforce the “three consecutive” requirement. With more than three requested runs, one exit failure followed or preceded by three clean runs can still satisfy `cleanRuns >= 3`.
- **Nit:** `volumeCount` counts every Podman volume on the machine, not volumes created by this harness. A user with an unrelated pre-existing volume receives a false I6 failure.
- **Nit:** I2’s scorer ignores the recorded process and mapped-window facts. A nonuniform graphical error window could correlate with the in-container screenshot and pass as the intended target even when VS Code never started.
- **Nit:** The host marker is only brought forward once and foreground ownership is not measured or maintained. Another host window can steal focus during the roughly 30-second synchronous run while the outcome still claims the marker was held foreground throughout.
- **Nit:** Only one extracted frame per second is scanned, while the recording is produced at 25 fps. The prose should not imply all recorded frames were checked; brief leakage between sampled frames would be missed.
- **Nit:** `measure-obs-plugin-surface.js` deletes every file in the operator-owned OBS `.sentinel` directory before and after each launch without backing up or restoring that state.
- **Nit:** OBS log selection uses the globally newest filename rather than associating a log with the launched PID or validating its command line before acceptance. A concurrently running OBS instance can make the measurement parse the wrong log.
- **Nit:** The raw OBS logs used as source evidence are not retained or hashed, leaving only parser-produced summaries even though the implementation reports having already fixed two measurement-parser defects.
- **Nit:** The criteria declare forbidden environment names, but the structural scorer never inspects container environment variables. The broader claim of having no audio-server or host-display path is therefore stronger than the checks performed.
- **Nit:** `run-capture.sh` calls `kill "${CODE_PID:-0}"`; in control mode `CODE_PID` is unset, so this becomes `kill 0` and signals the entire process group. It happened to complete in the recorded environment but is brittle across container-init behavior.
- **Nit:** The Containerfile calls the image reproducible while using mutable base-image and package-repository state without version pinning. Rebuilding later can produce a materially different VS Code, ffmpeg, and Debian stack.
- **Nit:** `run-capture.sh` says output is a bind-mounted path even though the harness intentionally uses zero bind mounts and extracts artifacts with `podman cp`.
