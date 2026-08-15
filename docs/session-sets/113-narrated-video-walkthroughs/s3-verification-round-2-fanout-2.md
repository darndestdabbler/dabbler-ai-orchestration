ISSUES FOUND

The Round 1 empty-delta defect is fixed: the current tree contains a substantive implementation and test delta. The following new blocking defects remain.

- **Issue 1: The documented one-command path fails in a fresh clone because it requires an undocumented, hard-coded repository virtualenv**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js`, `docs/walkthroughs/task-board-first-task/scenario.yaml`, `docs/walkthroughs/README.md`
  - **Failure scenario:** A typical user follows the stated prerequisites—Node.js 20+ and `npm install`—then runs `npm run walkthrough:web`. In a fresh clone, the gitignored `.venv` does not exist, so `venvPython()` throws before the browser or fixture starts and no recording, manifest, or fallback index is produced. This is probable because neither documented prerequisite creates the exact `.venv/Scripts/python.exe` or `.venv/bin/python` path the script requires.
  - **Acceptance criterion:** JUDGMENT - In a fresh clone satisfying every documented prerequisite but containing no pre-existing repository `.venv`, the documented `npm run walkthrough:web -- --no-video` path must generate a manifest and index without relying on an undisclosed interpreter location.
  - **Details:**
    - **Violation:** The session promises that “one command produces a watchable, captioned recording,” while the walkthrough documents list only Node.js and `npm install` as prerequisites.
    - **Impact:** The primary entrypoint fails before producing any deliverable for users who follow the instructions, which materially changes the merge decision for a one-command workflow.
    - **Evidence:** `venvPython()` accepts only the repository-local `.venv` interpreter and otherwise throws. Its recovery text says to run `pip install -e .`, but that command neither creates the required `.venv` nor ensures installation through its interpreter.
    - **Correct answer:** Either make the npm entrypoint locate/use a documented available Python interpreter and verify its dependencies, or document and automate creation of the exact required environment before presenting the recorder command as ready to run.

- **Issue 2: The generated recording is not actually captioned on the normal local-file viewing path**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/walkthrough_index.py`, `ai_router/walkthrough_run.py`, `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js`
  - **Failure scenario:** A typical user runs the command and opens the logged `.walkthrough-runs/.../index.html` directly from disk. The implementation itself states that Chromium refuses to load the external `<track>` sidecar over `file://`; therefore the video plays without synchronized captions. The prose step list below the player is not a caption track and may be off-screen while the recording plays. This is the normal viewing path because the command generates a static directory and starts no server for the result.
  - **Acceptance criterion:** JUDGMENT - Opening the generated index through the recorder’s documented default viewing path must display synchronized captions during video playback in Chromium, without requiring an undocumented web server.
  - **Details:**
    - **Violation:** The required end state is “a watchable, captioned recording,” and the code claims the index works when opened directly from disk.
    - **Impact:** The main generated recording lacks its required synchronized narration for the expected viewer, materially impairing accessibility and the core deliverable.
    - **Evidence:** `render_index()` emits an external `<track src="captions.vtt">`, while the module documentation explicitly acknowledges Chromium will not load that track over `file://`. The only fallback is a static step list, with no JavaScript-driven synchronized caption display.
    - **Correct answer:** Embed the VTT data or cues into the generated page and render synchronized captions locally, or make the command provide and document a viewing path that reliably serves the track over HTTP.

## NITS

- **Nit:** Recording failures outside `video.saveAs()` still fail the walkthrough → `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js` only degrades when copying the finalized video fails; failures during `newContext({recordVideo})`, `context.close()`, or video finalization reach the outer fatal catch → retry the run without `recordVideo` or otherwise produce the no-video manifest/index for record-specific failures.

- **Nit:** Cleanup stops being deterministic too early → `record-web-walkthrough.js` sets `usable = true` immediately after writing `run-finished`, before context closure, driver-output creation, and finalization → mark the run usable only after the manifest and index are successfully written, and remove incomplete derived output on later failure.

- **Nit:** Interrupted runs bypass cleanup → `record-web-walkthrough.js` has no `SIGINT`/`SIGTERM` handling, so stopping the 44-second run can leave the temporary video directory, partial event stream, and possibly browser processes → route termination signals through idempotent cleanup.

- **Nit:** Partial failed video files may survive unlisted → the `video.saveAs()` catch records a note but does not remove a partially created `recording.webm` → delete the target on save failure before producing the no-video manifest.

- **Nit:** Zero-byte recordings are accepted as browser videos → after `saveAs()`, the recorder registers the file without checking that `stat.size > 0`, and `parse_artifact()` accepts zero or negative declared byte counts → require a regular, non-empty video file before adding the artifact.

- **Nit:** `--out` can recursively delete unrelated data → any existing directory containing either `events.jsonl` or `driver-output.json` is classified as a prior run and removed wholesale → require a recorder-specific marker and matching scenario identity before recursive deletion.

- **Nit:** Command-line options do not require values → `parseArgs()` assigns `undefined` when `--scenario`, `--out`, or `--url` is last on the command line → reject missing or flag-shaped values during argument parsing.

- **Nit:** Driver-block validation does not enforce its documented closed schema → `validateDriverBlock()` ignores unknown top-level keys, does not validate `viewport`, accepts actions with zero or multiple verbs, and does not reject unknown expectation keys → validate every driver-block level and require exactly one action verb with the appropriate value shape.

- **Nit:** A missing emphasis target is silently accepted → `applyEmphasis()` returns `false`, but its caller ignores the result and records the step without emphasis or bounds → fail that step with a named selector error when an authored `emphasize` target is absent.

- **Nit:** The no-video page claims to point to the durable walkthrough but supplies no link → `ai_router/walkthrough_index.py` prints that “the walkthrough document is the deliverable” while neither copying nor linking `walkthrough.md` → include a valid relative/repository link or carry the standalone document as an artifact.

- **Nit:** The timing-anchor direction contradicts its stated guarantee → `record-web-walkthrough.js` uses `afterContext` as zero even though recording may begin between `beforeContext` and `afterContext`; this makes cue times early by up to the uncertainty, despite the comment claiming a cue will never fire before its event → use the appropriate bracket edge for that guarantee or describe the uncertainty without asserting a direction.

- **Nit:** Event validation permits contradictory records → `ai_router/walkthrough_run.py` allows `error` on completed, started, and run-level events; a completed event with an error becomes a “done” step that also displays an error → restrict `error` to `failed` events.

- **Nit:** Event validation does not enforce scenario execution order or non-overlap → separate steps can start out of authored order or before the previous step ends, producing overlapping or artificial 1ms caption windows → reject ordering contradictions when building the scenario timeline.

- **Nit:** Artifact validation does not verify the declared metadata → `parse_artifact()` checks existence but allows directories, duplicate singleton kinds, negative byte counts, and byte counts that disagree with the file → require regular files and validate size metadata against `stat()`.

- **Nit:** Driver-output shape validation is incomplete → `notes` can be a string and become one note per character, while a truthy non-mapping `target` later makes `render_index()` fail on `.items()` → validate `notes`, `target`, timestamps, and artifact-list container types in `load_driver_output()`.

- **Nit:** Artifact links permit active URI schemes → a Linux artifact filename such as `javascript:...` can pass relative-path validation and is emitted directly as an anchor `href` → constrain artifact paths to safe relative URL-path syntax or prefix links with `./`.

- **Nit:** The generated `scenarioPath` is often relative to the original invocation directory → later running `finalize` from another directory can no longer locate the scenario → store an absolute path for local reruns or a stable repository-relative path resolved against a recorded repository root.

- **Nit:** A malformed percent escape can crash the fixture server → `decodeURIComponent(req.url)` is outside error handling in `web-fixture-server.js` → catch `URIError` and return HTTP 400.

- **Nit:** The measurement harness leaks its temporary directory if fixture-server startup rejects → scratch creation occurs before `await startFixtureServer()` and before the cleanup `try/finally` → include server startup inside the cleanup scope.