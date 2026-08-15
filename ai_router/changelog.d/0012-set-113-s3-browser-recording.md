## [Unreleased] — a recorded walkthrough, and a manifest that never assumes a video

### Added

- **(Set 113 S3) The step-event stream, the run manifest and the static
  index for a recorded walkthrough.** New modules
  `ai_router/walkthrough_run.py` (the model, plus the `plan` and
  `finalize` CLI) and `ai_router/walkthrough_index.py` (the page).

  ```bash
  python -m ai_router.walkthrough_run plan docs/walkthroughs/<id> --driver playwright-web
  python -m ai_router.walkthrough_run finalize <run-dir>
  ```

  A run emits `events.jsonl` — `run-started`, then `started` /
  `completed` / `failed` per stable step id, then `run-finished` — and
  `finalize` turns it into `manifest.json`, retimed `captions.vtt` and a
  self-contained `index.html`.

  **The manifest references zero or more artifacts and assumes none of
  them is an MP4.** Kinds are a closed vocabulary that names
  `terminal-cast` and `transcript` alongside video, every artifact
  carries an explicit media type, and an **empty artifact list is
  valid** — failure to record must never fail the walkthrough. A
  manifest that lists a file nobody wrote is refused.

  **The inventory is the authored scenario, not the stream.** A run that
  stopped at step 3 reports steps 4 and 5 as `not-reached` rather than
  omitting them.

  **Timing is anchored rather than assumed.** Nothing reports the exact
  instant recording begins, so the driver brackets the call and records
  the width of the bracket as `anchor.uncertaintyMillis`. Cue times come
  from the run; the authored `seconds` are a floor the driver holds each
  step on screen for. A run is tied to the `portableDigest` of the
  scenario it was made from, and `finalize` refuses to assemble a run
  whose scenario has moved — a stale recording is regenerated, never
  patched.

- **(Set 113 S3) A browser walkthrough recorder, and the fixture web app
  it is proved against.** `npm run walkthrough:web` in
  `tools/dabbler-ai-orchestration` drives a real web UI through an
  authored scenario and writes a watchable, captioned result into
  gitignored `.walkthrough-runs/`. `--url` points the same recorder at a
  consumer's own application, which is the whole cross-cutting claim:
  .NET, Java, Python and vanilla-JS web applications are one target, not
  four. `--no-video` exercises the degraded path.

  The recorder does not parse `scenario.yaml` — it asks
  `walkthrough_run plan` — so the repository keeps exactly one scenario
  parser. It validates its own quarantined driver block, which the Python
  model deliberately treats as opaque.

  Attention emphasis outlines each step's target and dims the rest,
  injected by the driver rather than carried by the page, and is released
  as soon as the action has run so the result is on screen at full
  brightness. There is no capture-time zoom; each step's target bounding
  box is recorded so post-processing zoom stays possible without
  re-recording.

### Changed

- **(Set 113 S3) `render_captions` accepts real cue windows.** A recorded
  run retimes its captions through the existing WebVTT writer rather than
  a second copy of the cue arithmetic, which is how a caption file drifts
  from the video it is a sidecar for. Called without windows the output is
  byte-for-byte the committed, `--check`-gated rendering.

### Measured

- **(Set 113 S3) Browser `recordVideo`, with a control.** The same probe
  against the same fixture web app, run twice, differing only in whether
  Playwright's `recordVideo` option was passed. Arm A drove the UI *and*
  wrote a video; arm B drove the UI and wrote nothing — the exact
  inversion of the VS Code workbench result measured in the Set 113
  proposal. Reproducible with
  `node scripts/measure-browser-record.js`, which exits non-zero if
  recording ever starts costing the automation again. The workbench
  finding is platform-specific and must not be generalised.
