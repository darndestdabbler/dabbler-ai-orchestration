# Narrated Video Walkthroughs Spec

> **Purpose:** Make UAT worth doing. A reviewer watches a short narrated
> video of the real product being driven, then optionally repeats the same
> steps themselves on a fixture that is already staged. The reservation
> record, the problem evidence, and the **measured** feasibility basis are
> canonical in
> [`docs/proposals/2026-08-08-set-113-narrated-video-walkthroughs.md`](../../proposals/2026-08-08-set-113-narrated-video-walkthroughs.md)
> — **read it before Session 1; this spec executes it.**
> **Created:** 2026-08-08
> **Prerequisites:** Set 112 complete (operator sequencing decision, 2026-08-08).
> **Session Set:** `docs/session-sets/113-narrated-video-walkthroughs/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
>
> **Do not re-run the feasibility experiment as a blocker.** Set 111 S4
> measured it: Playwright's built-in `recordVideo` **breaks** the very
> automation it would record (the workbench window never attaches; no file
> is written), while the identical launch without it drives the real UI
> fine. The automation half already works. Session 1 starts from OS-level
> capture, not from `recordVideo`.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # A set whose deliverable IS the UAT experience must be judged as an experience. Its own walk is the acceptance test.
requiresE2E: true         # The walkthroughs drive the real Extension Development Host; the recording path is a rendering-surface consumer.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 112-remove-lightweight-tier
    condition: complete
```

---

## Why this set exists

A gate makes skipping **visible**; it does not make walking **pleasant**.
Set 111 S4 shipped the `requiresUAT` close gate because Set 110 S2 closed
with no walk and nothing noticed. But a gate that forces an unpleasant
activity produces waivers, and a waiver rate near 100% is a gate that has
been routed around rather than satisfied.

Set 111 S4 removed the **staging** cost — `npm run walk` now stages
everything and opens the view, proved by `npm run walk:smoke`. This set
removes the **comprehension** cost.

## Decisions already made — do not reopen

1. **Not Playwright `recordVideo`.** Measured, twice, with a control. See
   the proposal's feasibility table.
2. **One source, two outputs.** The step list is authored once and renders
   both the video's captions and the manual walkthrough. A video and an
   instruction sheet that drift apart are worse than no video, because the
   reviewer trusts the video and then cannot reproduce it.
3. **Many short videos**, one scenario each, measured in tens of seconds —
   not one long tour.
4. **Cross-cutting.** This lands in shared infrastructure so consumer repos
   inherit it. It is not one repo's test-folder script.
5. **Watching is not automatically walking.** Whether a watched video can
   satisfy `requiresUAT` is a **verification-reduction** question and
   therefore operator-held (decision-rights hard carve-out). Session 3
   presents it as an education-mode brief; it is never self-authorized.

## Non-goals

- **No new UAT content for other sets.** This builds the capability and
  exactly one exemplary walkthrough, not a library.
- **No voice synthesis in this set** unless Session 3's brief chooses it.
  Captions are diffable, translatable, accessible and reviewable.
- **No CI recording.** A headless runner records a different thing than the
  operator's machine shows.

---

## Sessions

### Session 1 of 3: The recording spine

**Steps:**

1. Register. Read the proposal, especially the feasibility table.
2. **Settle the capture dependency** and record the choice: ffmpeg
   (`-f gdigrab` on Windows) as a documented prerequisite, bundled, or an
   optional capability. **Portability rule binds:** the core must work with
   no recorder present, degrading to the manual walkthrough alone.
3. **Build the recorder** around the EXISTING automation
   (`scripts/vscode-launch.js` + the Layer 3 launch machinery) — start
   capture, drive the scenario, stop capture, emit the file. Failure to
   record must never fail the walkthrough.
4. **Record one real walkthrough end-to-end** of the Work Explorer on the
   UAT fixture, and watch it. The artifact IS the evidence; a passing test
   that produces an unwatchable video has proved nothing.
5. Full pytest at close after freeze; verify, close.

**Creates:** the recorder, one recorded `.webm`, the dependency decision record
**Touches:** `tools/dabbler-ai-orchestration/scripts/`, `ai_router/`
**Ends with:** one command produces a watchable video of the real product being driven, and says so honestly when the recorder is absent.
**Progress keys:** `captureDecision`, `recorderBuilt`, `firstVideoRecorded`

---

### Session 2 of 3: One source, two outputs

**Steps:**

1. Register.
2. **Author the walkthrough step format**: each step carries what it does
   (high level, non-technical), what is being clicked or typed
   (click-and-enter level), and the automation that performs it.
3. **Render captions from it** — timed text emitted by the script as it
   runs, shipped as a `.vtt` sidecar and/or burned in.
4. **Render the manual walkthrough from the SAME steps** — the "repeat it
   yourself" doc, pointing at the already-staged fixture. Add a test that
   fails if narration and manual steps can diverge.
5. Full Layer 3 at close after freeze (this session touches the walk
   harness); verify, close.

**Creates:** the step format, the caption renderer, the manual-walkthrough renderer, the divergence test
**Touches:** `ai_router/`, extension `scripts/`
**Ends with:** one authored step list produces both a narrated video and a manual walkthrough that cannot drift apart.
**Progress keys:** `stepFormat`, `captionsRendered`, `manualRendered`, `divergenceTest`

---

### Session 3 of 3: Adoption, and what counts as a walk

**Steps:**

1. Register.
2. **Education-mode brief (operator-held): does watching satisfy
   `requiresUAT`?** Present the honest shape — watch-only recorded as its
   own status, distinct from `walked` — plus the alternatives and their
   consequences. This reduces verification if answered carelessly, so it is
   never self-authorized; journal it with the operator's attestation.
3. **Wire the outcome into the close gate** and `disposition.uat` exactly
   as the operator decided, with tests for each recorded status.
4. **Document the authoring flow** in the session-set authoring guide, and
   make the consumer-repo story explicit.
5. **Dogfood:** this set's own UAT is a narrated video plus its paired
   mini-workflow. Full matrix once at the release boundary; verify, close;
   `change-log.md`, Step 9 review, advisory path-aware critique.

**Creates:** the gate wiring, authoring-guide section, this set's own narrated walk
**Touches:** `ai_router/gate_checks.py`, `ai_router/disposition.py`, `docs/`
**Ends with:** the framework has a UAT format the operator will actually use, and the rule for what counts as a walk is the operator's, recorded.
**Progress keys:** `watchVsWalkDecided`, `gateWired`, `authoringDocumented`, `dogfoodWalk`

---

## End-of-set deliverables

- A recorder that wraps the existing automation and degrades honestly when
  no capture tool is present.
- One authored step list rendering BOTH narrated captions and a manual
  "repeat it yourself" walkthrough, with a test that they cannot diverge.
- At least one exemplary narrated walkthrough of the real product.
- An operator-decided, tested answer to "does watching count as walking",
  journaled with attestation.
- Consumer-repo adoption documented.

## Risks this set should expect

- **The recorder is the easy half; the narration is the hard half.**
  Writing captions a non-technical reviewer actually understands is
  authoring work, not engineering work. Budget for it.
- **Binary artifacts in git are forever.** Settle storage in Session 1
  before the first video is committed by reflex.
- **The watch-vs-walk question is a verification reduction.** Under
  remediation or schedule pressure it will be tempting to let watching
  count. It is operator-held; `decision_journal` refuses to write it under
  AI authority.
- **This set's deliverable is judged by taste.** The word to beat, from
  Set 111, is "pleasurable" — and the operator's stated bar is that the
  reviewer does very little work and still gains confidence.
