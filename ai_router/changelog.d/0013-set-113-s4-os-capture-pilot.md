## [Unreleased] — a measured answer on Windows OS capture

### Measured

- **(Set 113 S4) Windows OS capture of the framework's own product, against
  criteria fixed before the first capture.** The one surface the portable
  browser recorder cannot serve is this repository's own VS Code extension,
  because Playwright's `recordVideo` was measured to break the workbench
  (Set 111 S4). This session bought a measured answer instead of a
  speculative one.

  The criteria are a committed file
  (`docs/session-sets/113-narrated-video-walkthroughs/s4-pilot-criteria.json`)
  that the harness **reads**, refuses to run without, and stamps the
  SHA-256 of into its own output — so "criteria preceded the first capture"
  is checkable by someone who was not there rather than asserted. Seven
  criteria, each with an instrument, and a **control** wherever the claim
  would otherwise be unfalsifiable: a correlation threshold with no decoy
  comparison cannot tell a working instrument from one that returns 1.0 for
  everything, and a leakage scan with nothing to find passes whether or not
  the detector works.

  Reproduce with `npm run pilot:os-capture` from
  `tools/dabbler-ai-orchestration`. The measurement itself is the durable
  deliverable: `s4-os-capture-measurement.json`, with the verdict and its
  residuals in `s4-os-capture-outcome.md`.

### Added

- **(Set 113 S4) An optional Windows walkthrough recorder for the VS Code
  product, behind an internal and explicitly unstable interface.**
  `npm run walkthrough:vscode` drives the AI Work Explorer through the
  authored scenario and records that window with OBS Studio.

  It shares everything shareable with the browser recorder — the same
  scenario source, the same `walkthrough_run plan` handover, the same
  step-event stream, the same artifact-agnostic manifest, the same rule
  that **failure to record must never fail the walkthrough**. Only the
  driver and the capture backend differ, which is the two-backend seam the
  operator's 2026-08-10 note asked for. `--no-video` exercises the degraded
  path.

  **OBS is never bundled.** It is a documented optional prerequisite, and
  all three ways it can be missing — not installed, websocket unreachable,
  password rejected — produce a named failure and a walkthrough that still
  finishes and still writes a manifest carrying no video.

  **It captures one window and never a screen.** The recorder builds its
  own OBS scene collection and profile, deletes every input it did not
  create, asserts the scene holds exactly the one window capture, and puts
  the operator's configuration back byte-for-byte. A default OBS scene
  collection routinely carries a webcam and a microphone; borrowing one
  would put both into a recording nobody asked for.

  **More than one matching window is refused, not resolved.** Selecting by
  title passes in a sterile environment and captures the wrong window in a
  real one — on a developer's machine there is routinely a second
  `Code.exe`. The recorder enumerates every candidate OBS offers and stops
  rather than guessing.

- **(Set 113 S4) A dependency-free obs-websocket v5 client and PNG
  decoder.** Node ships a global `WebSocket` and `zlib`, the v5 handshake
  is about a hundred lines, and a PNG is a header plus deflated filtered
  scanlines. Taking `obs-websocket-js` and an image library would have
  added two dependencies everyone installs for a Windows-only optional
  capability almost nobody runs.

### Changed

- **(Set 113 S4) `work-explorer-first-look`'s driver block is
  `implemented`.** Session 2 authored the quarantine and marked it
  `proposed` because nothing consumed it; this session built the driver
  that does. Its `expect` clauses are deliberately weaker than the portable
  prose above them — a row being visible is what a driver can check, and
  claiming it had verified the hover card would be the machine taking
  credit for the reader's half of the walkthrough. Editing the block leaves
  all four generated documents byte-identical, which `scenario_render
  --check` confirms.

### Fixed

- **(Set 113 S4) An unavailable OBS failed the whole walkthrough and
  deleted its output.** The opposite of the degradation the spec demands:
  the written documents are the deliverable and the video is an
  enhancement, so a machine with no OBS must still get a walkthrough, a
  manifest and an index that honestly say there is no recording. Found by
  writing the measurement for that path rather than by asserting it.

- **(Set 113 S4) A recording output that never starts is now a failure
  rather than a silence.** OBS accepts `StartRecord`, returns success, and
  — with certain output settings — never starts: no websocket error, no
  line in OBS's own log, no recording. The first cut let the poll time out
  and reported "OBS produced no output file", which names the symptom and
  hides the cause.

- **(Set 113 S4) Cleanup predicted OBS's filenames instead of observing
  them.** OBS slugs a scene-collection name by its own rules
  (`dabbler-walkthrough-collection` becomes `dabblerwalkthroughcollection`),
  so the removal deleted nothing **and** the survival check reported
  success — the worst of both. It now snapshots the OBS configuration
  directories before it creates anything and removes what appeared. The
  general form is worth carrying: whenever another program owns the naming,
  observe rather than predict.
