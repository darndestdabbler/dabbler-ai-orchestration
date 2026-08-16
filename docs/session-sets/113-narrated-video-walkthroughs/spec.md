# Narrated Video Walkthroughs Spec

> **Purpose:** Make UAT worth doing, and make what UAT happened *legible*.
> A reviewer reads a short scenario document — or watches a narrated video
> of the real product being driven — and optionally repeats the steps
> themselves on a fixture that is already staged. What they did is then
> recorded per component, factually, rather than collapsed into a
> pass/fail flag.
>
> **Created:** 2026-08-08. **Restructured 2026-08-10** from three sessions
> to four, after the operator's notes and three pre-set consult rounds.
> **Amended 2026-08-15** (operator ruling): OBS Studio (Windows Graphics
> Capture via obs-websocket) is Session 4's primary capture candidate;
> ffmpeg `gdigrab` is the fallback. Pass criteria unchanged. See the
> operator note of 2026-08-15.
> **Amended 2026-08-15** (Session 1): `uatComponents` added to the
> configuration block. Session 1 shipped the inventory-aware gate, and an
> armed set that declares no inventory is refused at close — so this set
> would otherwise have made its own Session 4 unclosable. This adds the
> data the new gate reads; it does **not** change an arming flag, and it
> could not affect Sessions 1-3, which owe no accounting under
> `uatScope: per-set`. The four entries are the human-observable surfaces
> Sessions 2-4 create, read off this spec's own Creates lines. Journaled
> in `decisions.jsonl`.
> **Amended 2026-08-16** (Session 4): a fifth `uatComponents` entry for the
> containerised capture path Session 5 may create. Same reasoning as the
> first amendment — the inventory has to name what the terminal session
> will owe an accounting for, or an omitted component becomes the new form
> of evaporation. It does **not** change an arming flag. Journaled.
> **Amended 2026-08-16** (before Session 5, operator direction): two
> **tutorial-video sessions** are added, 7 and 8, and the set grows from six
> to eight. Session 8 becomes the set-terminal session; Session 6 no longer
> is. `uatComponents` grows two entries for what they create, on the same
> reasoning as both earlier amendments. **No arming flag changes.** The
> operator also ruled that the pointer-visibility work lands inside Session
> 7, and that both tutorials record the **host**, not the container. See the
> operator note of 2026-08-16, *"The recordings work; show the pointer, and
> make two tutorials"*. Journaled.
> **Prerequisites:** Set 112 complete (operator sequencing decision, 2026-08-08).
> **Session Set:** `docs/session-sets/113-narrated-video-walkthroughs/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Read before Session 1, in this order.**
>
> 1. [`operator-notes.md`](operator-notes.md) — the operator's 2026-08-10
>    direction and rulings. **Required reading at the start of every
>    session.**
> 2. The reservation record and measured feasibility basis:
>    [`docs/proposals/2026-08-08-set-113-narrated-video-walkthroughs.md`](../../proposals/2026-08-08-set-113-narrated-video-walkthroughs.md).
> 3. The consult record, in order —
>    [round 1](provider-consults/synthesis.md),
>    [round 2](provider-consults/synthesis-round-2.md),
>    [round 3](provider-consults/synthesis-round-3.md). **Round 3 (a
>    critical review that overturned parts of the round-2 consensus)
>    supersedes round 2 where they conflict**, and this spec is written to
>    round 3.
>
> The consults are input, not authority. Where this spec and a consult
> disagree, this spec governs; where the operator's notes and this spec
> disagree, raise it rather than choosing.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # A set whose deliverable IS the UAT experience must be judged as an experience. Its own walk is the acceptance test — and Session 4 is what keeps that walk possible on this repo's own product.
requiresE2E: true         # Sessions 3 and 4 drive real rendering surfaces (a browser fixture and the Extension Development Host).
uatStyle: ad-hoc
uatScope: per-set
uatComponents:            # Set 113 S1's own gate, applied to this set. The TERMINAL session (now 8) owes one record per line.
  - Rendered walkthrough and training document
  - Static generated index
  - Recorded web scenario
  - Windows OS-capture pilot
  - Containerised capture path   # added 2026-08-16 with Session 5; journaled
  - Single-module tutorial recording set   # added 2026-08-16 with Session 7; journaled
  - Multi-module tutorial recording set    # added 2026-08-16 with Session 8; journaled
pathAwareCritique: advisory
# Declared 2026-08-16, when the admission test was run against the whole
# amended spec and reported four sessions over cap. Sessions 7 and 8 were
# TRIMMED rather than excepted where trimming was honest -- 7 merged capture
# and time-compression into one pipeline step, 8 folded its quality bar into
# the recording step and its conventions into the safety pass, which took 8
# from N=4 to N=2 and needs no exception. What follows is what could not be
# trimmed without losing work.
sessionSizeException: 5 - six declared work steps, of which two (read the
  operator's note; do not redirect to Azure) are a reading instruction and a
  guardrail rather than work, and the remaining four are one sequential
  measurement: criteria first, plugin surface before the container
  (so the cheap mitigation can dominate and cancel the expensive one), then
  the container, then the trade it forces. Splitting it re-pays container
  setup to no benefit, and the plugin measurement exists precisely so the
  later steps may not be needed.
sessionSizeException: 6 - a diagnosis session, where reproducing both failures
  and judging the servant violation on its own merits are the evidence the
  fix and its falsifier rest on. Splitting it would hand a later session a
  diagnosis it did not make.
sessionSizeException: 7 - four work steps after trimming, and none is
  droppable: the pointer must be fixed BEFORE recording (operator ordering
  ruling) or the tutorial is recorded twice, the pipeline is what makes a
  long session watchable, the recording is the deliverable, and the safety
  pass is what stands between a public artifact and an incident. The
  alternative is splitting into two sessions, which the operator's direction
  of 2026-08-16 (two more sessions, not three) does not leave open.
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
removes the **comprehension** cost, and replaces a binary flag with a
truthful record.

## Decisions already made — do not reopen

1. **UAT is a confidence dial, not a requirement** (operator, 2026-08-10).
   A flag that can always be bypassed — and always should be, to prevent
   impasses — is not a requirement. What matters is the **marginal
   confidence** the UAT work bought, which varies by reviewer type,
   reviewer count, and **per component**. The gate therefore stops
   demanding a walk and starts demanding an **accounting**. **"No UAT" is a
   valid, attested, passing value.** Nothing blocks; nothing evaporates.
   This survived all three consult rounds intact, including the round
   commissioned to attack the consensus.
2. **The synced window is cut** (operator, 2026-08-10) — no replaying
   application state to match a video timestamp. **Condition attached:**
   very clear, step-by-step written instructions must let a reviewer reach
   any point in the scenario. Honest reading (round 3): *"reach any point"*
   means **replaying a documented prefix from a known baseline or
   checkpoint**, not pretending every stateful step supports random access.
3. **One source, many outputs.** The scenario is authored once and renders
   the manual walkthrough, the training document, the captions and the
   chapter metadata. A video and an instruction sheet that drift apart are
   worse than no video, because the reviewer trusts the video and then
   cannot reproduce it.
4. **The written artifact is the durable deliverable; the video is an
   enhancement.** It must be usable with no video at all. This is what makes
   the core portable, and it is what the portability rule demands.
5. **Generated video is a UAT aid, not published training material.**
   Round 3 killed the tempting round-2 claim that on-demand regeneration
   makes staleness impossible: the scenario itself can go stale, the
   automation can stop matching the product, and a generated file is not
   available "at any time" unless it is published somewhere learners can
   reach. Durable training distribution is a **later, named set**.
6. **Not Playwright `recordVideo` *against the VS Code workbench*.**
   Measured twice, with a control (see the proposal's feasibility table).
   **This finding is platform-specific and must not be generalised** — it
   says nothing about `recordVideo` in an ordinary browser context, which is
   this set's primary recording path.
7. **Many short scenarios**, one each, measured in tens of seconds — not one
   long tour.
8. **Cross-cutting.** This lands in shared infrastructure so consumer repos
   inherit it. It is not one repo's test-folder script.
9. **Agent-driven UI exploration is not UAT and is not built here.** The
   operator's underlying observation — that AI cheats in E2E — is
   well-founded and is renamed precisely in round 3 as **common-mode
   self-verification failure**. It earns a named follow-on set, not a
   feature in this one, and it must never count as a human reviewer.

## Non-goals

- **No new UAT content for other sets.** This builds the capability and
  exactly one exemplary scenario, not a library.
- **No voice synthesis.** Captions are diffable, translatable, accessible
  and reviewable.
- **No CI recording.** A headless runner records a different thing than the
  operator's machine shows. Regeneration **on demand** is the model;
  regeneration **in CI** is refused.
- **No committed video binaries.** Generated artifacts go to ignored output.
- **No custom viewer application.** A static generated index linking the
  video and the steps is sufficient unless real use proves otherwise.
- **No generic cross-platform desktop recorder**, no dependency bundling, no
  audio production, no media publishing pipeline.
- **No self-assessed confidence scores and no parallel debt ledger.** The
  UAT record carries facts; risk is intrinsic to what the facts say.

---

## Sessions

### Session 1 of 8: Truthful UAT accounting

The gate first, because it is the part that is useful even if every later
session is cancelled.

**Steps:**

1. Register. Read the operator notes and the three consult syntheses.
2. **Design the UAT record**, replacing binary `walked | waived` in
   `disposition.uat` with per-component entries carrying **facts only**:
   in-scope component, method, human reviewer type and count, evidence
   links, findings or concerns, and an explicit attested `none`. No
   self-assessed confidence score; no separate debt ledger. Risk is what the
   record *implies*, not a number someone types.
3. **Gate on the component inventory, not on whatever records exist**, and
   wire it into `uat_walk_recorded` with tests for each recorded status —
   including the passing-`none` path and the missing-component refusal.
   This is the load-bearing detail: a gate that merely validates present
   records makes **an omitted component the new form of evaporation**.
   Every declared in-scope component must carry a record, or the session
   must carry an attested not-applicable disposition.
4. **Journal the decision.** This is a verification reduction under the
   decision-rights carve-out. The operator's ruling of 2026-08-10 is
   direction; the attestation is written here, in `decisions.jsonl`, under
   operator authority. `decision_journal` refuses it under AI authority, and
   that refusal is correct.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the UAT record schema, the inventory-aware gate, the journaled decision
**Touches:** `ai_router/disposition.py`, `ai_router/gate_checks.py`, `ai_router/tests/`, `docs/planning/session-set-authoring-guide.md`
**Ends with:** a session cannot close having silently ignored a component, and "no UAT" is something a human said rather than something that happened by default.
**Progress keys:** `recordSchema`, `inventoryGate`, `gateTests`, `decisionJournaled`

---

### Session 2 of 8: Portable scenario source and standalone rendering

**Steps:**

1. Register.
2. **Define the smallest platform-neutral scenario model.** Stable scenario
   and step IDs; prerequisites and fixture startup; a known baseline;
   reset, recovery and checkpoint instructions; per step, the action and the
   **expected observable result**.
3. **Quarantine driver detail.** Playwright selectors and any other
   target-specific mechanics live in platform-specific blocks, never in the
   portable step semantics. This is the seam that actually matters — round 3
   rejected a published recorder-plugin contract as premature abstraction
   and named this instead.
4. **Render from the one source:** the manual UAT walkthrough, the training
   document, the captions, and chapter metadata. **Add a test that fails if
   the renderings can diverge.** Honour the operator's condition from
   decision 2 in what the documents actually say: reaching an arbitrary
   point means replaying a documented prefix from a baseline or a named
   checkpoint. State that plainly rather than implying random access.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the scenario model, the renderers, the divergence test
**Touches:** `ai_router/`, `docs/`
**Ends with:** one authored scenario produces a manual walkthrough and a training document that stand alone with no video, and cannot drift apart.
**Progress keys:** `scenarioModel`, `driverQuarantine`, `renderers`, `divergenceTest`

---

### Session 3 of 8: Browser recording proof

The portable recording path, proved where the framework's actual products
live. **Not** against this repo's extension.

**Steps:**

1. Register.
2. **Build against a dummy web app**, standing in for the .NET / Java /
   vanilla JS / Python web targets that are the real audience. First act:
   reproduce a browser `recordVideo` success **with a control**, the same
   way Set 111 S4 measured the workbench failure — this repo has so far
   measured only the failing case.
3. **Emit a timestamped step-event stream** (`started` / `completed` /
   `failed`) keyed by the stable step IDs from Session 2 — driving caption
   timing and chapter mapping — and **a run manifest that can reference zero
   or more artifacts** (browser video, OS video, terminal cast, captions,
   screenshots, transcript) *without assuming every artifact is an MP4*.
   The manifest is the cheap hedge against platform uncertainty, and it is
   the only one this set pays for.
4. **Generate into ignored output**, with deterministic cleanup on failure,
   and a static generated index linking video to steps. Failure to record
   must never fail the walkthrough.
5. **Cross-provider verification.**
6. **Required portion of the full test suite** — this session drives a
   rendering surface, so Layer 3 is owed (`L-064-12`).
7. **Close-out.**

**Creates:** the browser recorder, the step-event stream, the run manifest, the static index, one recorded web scenario
**Touches:** extension `scripts/`, `ai_router/`, a fixture web app
**Ends with:** one command produces a watchable, captioned recording of a real web UI being driven, and degrades honestly to the Session 2 document when it cannot.
**Progress keys:** `browserRecordMeasured`, `stepEventStream`, `runManifest`, `webScenarioRecorded`

---

### Session 4 of 8: Bounded Windows OS-capture dogfood

**Strictly bounded. One session. It ends in a measurement either way.**

Round 2 recommended refusing OS capture outright; round 3 overturned that as
*"an artifact of treating 'OS capture' as synonymous with 'a cross-platform
media-management product'"*. This session buys a measured answer instead of
a speculative one — and it is what keeps this repo able to use its own UAT
tooling on its own product.

**Steps:**

1. Register.
2. **Set the pass criteria before the first capture.** It passes only if it
   can repeatedly select the intended window; exclude unrelated desktop
   pixels; preserve usable resolution under the operator's normal display
   scaling; align step events with captions; fail clearly when the
   dependency is absent; and clean up deterministically. Bar: **ten
   consecutive clean captures from a fresh fixture, with no wrong-window
   capture and no privacy leakage.** No audio. Criteria decided after the
   first capture are not criteria.
3. **Run the pilot** against the Work Explorer, using the automation that
   already works (`scripts/vscode-launch.js` + the Layer 3 launch
   machinery). **OBS Studio is the primary capture candidate** (operator
   ruling, 2026-08-15): its Windows Graphics Capture source tracks the
   intended window under occlusion, excludes unrelated desktop pixels, and
   handles display scaling — the three places ffmpeg `gdigrab` (GDI-based,
   prone to black frames on hardware-accelerated apps such as Electron, and
   to occlusion leakage) is most likely to miss the step-2 bar — and
   obs-websocket, bundled since OBS 28, makes scene setup, start/stop and
   output paths scriptable. ffmpeg (`-f gdigrab`) is the **fallback**
   candidate. Both are **documented optional prerequisites** — never
   bundled, never in the portable core; "dependency absent" (OBS not
   installed, or running without its websocket reachable) is the
   clean-failure path the criteria already demand, not a condition to
   engineer around. The step-2 pass criteria are **unchanged** — whichever
   backend runs must earn them. **Do not expand:** not cross-platform
   capture, not native desktop automation beyond what already exists here,
   not dependency bundling, not audio, not publishing, and **no
   capture-time zoom via OBS scene transforms** (operator note,
   2026-08-15 — attention emphasis is a driver/post-processing concern,
   not a capture concern). If the session starts growing, it has failed
   its own budget — stop and record that.
4. **Record the outcome either way.** Pass → ship as an optional Windows
   capability behind the **internal, explicitly unstable** recorder
   interface, with manual-only degradation intact. Fail → keep the
   measurements as the durable deliverable, keep manual-only degradation,
   and defer desktop capture **with evidence**. **Reserve the follow-on
   sets** named below so they are not lost.
5. **Cross-provider verification**, including the advisory path-aware
   critique.
6. **Required portion of the full test suite** — the full matrix once, at
   the release boundary.
7. **Close-out**, including this set's own dogfood UAT — its scenario
   document plus, if the pilot passed, its own narrated recording —
   `change-log.md`, and the Step 9 review.

**Creates:** the pilot measurements, and (only on a pass) an optional Windows recorder
**Touches:** extension `scripts/`, `docs/`
**Ends with:** a measured, documented answer on OS-level capture — and this repo either can record its own product or knows exactly why it cannot.
**Progress keys:** `pilotCriteriaSet`, `pilotRun`, `pilotOutcomeRecorded`, `followOnSetsReserved`, `dogfoodWalk`

---

### Session 5 of 8: Containerised capture — measure the isolation

**Added 2026-08-16 on operator direction**, after Session 4 put two large
open-source media stacks (OBS Studio, ffmpeg) into this framework's
documented prerequisites. The operator's framing:

> *"Especially in the age of AI-powered exploitation of software
> vulnerabilities, open source software is generally considered more risky.
> Yes, OBS Studio is also open source. What we may want to consider is this
> — whatever system we end up using — if possible, use it in a container to
> limit the risk."*

**The operator also supplied the shape that makes it tractable**, and it
corrects this spec's first framing of the problem. Session 4's reservation
said a container cannot capture a *host* window without being handed back
most of the isolation — true, and the wrong question. The operator's
proposal is to **put both the target and the capturer inside**: VS Code and
OBS in the same container, capturing a display that never leaves it. Then
no capture crosses the boundary, and the media stack never sees host
pixels, host windows or host devices. That is the right shape.

**Steps:**

1. Register.
2. **Set the pass criteria before the first container run.** Session 4's
   discipline, reused deliberately: criteria committed first, read by the
   harness, digest stamped into the measurement. Reuse `s4-pilot-criteria`
   where the claims are the same — this is the same capture, somewhere
   else — and state plainly which criteria a container cannot be asked to
   meet.
3. **Read the operator's 2026-08-16 note before ordering the work.** It
   reframes this session: the risk that matters is **not** that OBS and
   ffmpeg are large open-source dependencies, it is that a screen recorder
   is a facility for an AI-driven process to read whatever is on the
   operator's display. Session 4 governed that carefully; a container
   **removes** it. So the plugin measurement below is still worth doing —
   it is cheap, and it may dominate on the supply-chain axis — but it does
   nothing for the capability risk, and it must not be mistaken for an
   answer to it. The fidelity cost of a Linux recording is **accepted**
   (operator, 2026-08-16); state it, do not solve it.
4. **Measure the cheap mitigation.** OBS ships
   `--only-bundled-plugins`. Session 4 observed the operator's install
   loading a DeckLink SDK, an NVIDIA filters plugin, a CEF browser source
   and an ML background-removal model, none of which this framework wants.
   Measure the plugin surface with and without the flag **before** building
   anything: if it buys most of the risk reduction, the container may not
   be worth its cost, and that is a real answer.
5. **Build the container and measure what it costs.** VS Code and OBS on a
   virtual display inside Podman, driven by the existing Layer 3 machinery.
   This repo already has `ai_router/podman_sandbox.py` (Set 069 S4) built
   on the same principle — the container as the trust boundary.
6. **Name the fidelity trade honestly.**
   Podman on Windows is a Linux VM, so this records **Linux VS Code**, not
   the Windows VS Code staff actually run. For proving the extension works
   that is mostly fine; for a *training* video it is a different product on
   screen. Decide which the artifact is for, and say so.
7. **Do not redirect this session to Azure.** The operator asked for
   research on an Azure VDI recording target and it is done —
   [`2026-08-16-azure-virtual-desktop-as-a-recording-target.md`](../../proposals/2026-08-16-azure-virtual-desktop-as-a-recording-target.md)
   — as a *future capability* for their government organisation, not as
   this session's work. It carries two VERIFY-FIRST items, one of which is
   that AVD can be configured to block exactly this recorder.
8. **Cross-provider verification.**
9. **Required portion of the full test suite.**
10. **Close-out.**

**Creates:** the isolation measurements, the plugin-surface comparison, and (only if it earns it) a container capture path
**Touches:** `tools/dabbler-ai-orchestration/scripts/`, `ai_router/podman_sandbox.py`, `docs/`
**Ends with:** a measured answer on whether the capture dependencies can be isolated, what that costs in fidelity, and whether the cheap mitigation dominates.
**Progress keys:** `isolationCriteriaSet`, `pluginSurfaceMeasured`, `containerRunMeasured`, `fidelityTradeRecorded`

---

### Session 6 of 8: Why the pull critique could not reach two providers

**Added 2026-08-16 on operator direction.** Session 4's advisory
path-aware critique produced **no artifact** across three attempts: google
succeeded every time, openai failed every time, in two distinct ways.

**Steps:**

1. Register.
2. **Reproduce both failures before changing anything.** (a) The default
   openai critic raised `DeterministicServantViolation` — *"grep: tool
   result does not match raw ground truth"* — the servant-integrity guard
   refusing a critic that paraphrased tool output instead of reporting its
   bytes. (b) Pinned to `gpt-5-6-sol` and then `gpt-5-5`, openai returned
   **HTTP 400** from `https://api.openai.com/v1/responses`.
3. **Start from the sharpest fact, which is already known.** The *same*
   openai models answered five `session-verification` calls in Session 4
   without trouble. So the ordinary routed path works and the
   pull-critique path does not — this is a router-side defect, not a
   provider outage, and the difference between the two transports is where
   the answer is.
4. **Judge the servant violation on its merits, separately.** A critic that
   summarises its own evidence is exactly what that guard exists to catch,
   so (a) may be the guard working correctly rather than a bug. Say which.
5. **Ship a falsifier, not just a fix** (L-112-1): a test that plants the
   failing transport shape and asserts the critique refuses, and one that
   plants the legitimate shape and asserts it does not.
6. **Cross-provider verification.**
7. **Required portion of the full test suite.**
8. **Close-out**. This session was set-terminal when it was added on
   2026-08-16 and **is no longer**: Sessions 7 and 8 were added later the
   same day, so `change-log.md`, the Step 9 review and the set's UAT
   accounting move to **Session 8**. Close mid-set, with a
   `next_orchestrator` handover.

**Creates:** the reproduction, the diagnosis, and the fix or a documented refusal
**Touches:** `ai_router/pull_critique.py`, `ai_router/pull_verifier.py`, `ai_router/providers.py`, `ai_router/tests/`
**Ends with:** the automated path-aware critique either reaches two providers on this seat, or the reason it cannot is written down where the next session will find it.
**Progress keys:** `failuresReproduced`, `transportDiagnosed`, `falsifierShipped`, `outcomeRecorded`

---

### Session 7 of 8: Show the pointer, then record the single-module tutorial

**Added 2026-08-16 on operator direction**, with the first tutorial video.
Two pieces of work, and **the order between them is a requirement rather
than a preference** (operator, 2026-08-16): *"We should get the cursor
functionality working before recording the purpose-built new tutorials."*
A tutorial recorded without a visible pointer is a tutorial that gets
recorded twice, and the second recording is the expensive one — a real
session set driven by a real engine, not a scripted replay.

**This session changes genre, and that is the thing most likely to go
wrong.** Sessions 2–4 drive the product with Playwright through an authored
step list, in tens of seconds. This one records a **human** doing real work
over minutes. The capture backend is the same; the driver is gone, because
the driver is a person. Anything that tries to make this look like one more
scenario has misread it.

**Steps:**

1. Register. Read the operator notes, and in particular the second note of
   2026-08-16.
2. **Show the pointer.** The diagnosis is already made and does not need
   repeating — capture-side cursor drawing is **already on** (`cursor: true`
   on the OBS window-capture input, `-draw_mouse 1` in the ffmpeg fallback),
   and nothing ever moved a pointer, because synthesised debug-protocol
   clicks do not. Two mechanisms, because the two paths fail differently:
   - **VS Code path:** move the **physical** Windows pointer to the target
     before each synthesised click, interpolated across a few frames so the
     recording shows motion rather than teleportation. This **takes over the
     operator's real mouse** for the length of a capture, so it is opt-in,
     it announces itself on the console before it starts, and it restores
     the entry position on every exit path including failure. Never a
     default; never in the portable core.
   - **Web path:** draw a **synthetic** pointer into the page, because
     Chromium's `recordVideo` composites no cursor at all and physical
     pointer motion would change nothing there. It extends the emphasis
     injection the web recorder already performs rather than adding a second
     mechanism.
   - **Prove it in the artifact, not in the code.** Session 4's discipline:
     assert that a pointer is *visible in the recorded frames* near the
     target's bounding box at the moment of the click, and ship the
     falsifier — the same check against a recording made with the feature
     off must fail. A unit test asserting that a flag was passed proves
     nothing about what a viewer sees.
   - **Do not expand:** no click ripples, no highlight animations, no cursor
     theming, no input replay.
3. **Build the long-form recording pipeline** — capture and
   time-compression together, because they are one path from a real
   session to a watchable file, and splitting them across steps would only
   have split the same work across two logs.
   - **Capture:** start and stop around a **real** session in a **real** VS
     Code window, not the Extension Development Host, because the operator
     is driving the shipped product. One recording per session, named by
     set and session number. **It observes and nothing more:** it must not
     write to `session-state.json`, drive the orchestrator, or make a
     session behave differently because it is being recorded.
   - **Time compression, derived from the framework's own record.** This is
     the one place this framework has an advantage over a video editor: a
     Dabbler session already writes `session-events.jsonl` and
     `activity-log.json` with real timestamps, so *which stretches were
     waiting* is **derivable** rather than eyeballed. Emit a **speed-ramp
     plan** — segments and rates, as a text artifact — and apply it with
     ffmpeg (`setpts`; there is no audio track, which keeps this a
     one-filter problem). The plan being a file is the point: an edit
     decision list can be regenerated and reviewed, and a timeline inside
     an editor cannot. **State the applied compression per segment**, and
     never compress an interval where something happened.
4. **Author and record the single-module tutorial.** A **purpose-built toy
   project** (operator ruling, 2026-08-16), one module, **three session
   sets**, each session its own recording — and it must show **AI helping to
   author the plan and decompose it into session sets**, which is precisely
   the half of the lifecycle Set 108's walk could not prove, because an
   orchestrator cannot drive it. The written walkthrough renders from the
   Session 2 scenario source as always: the documents stand alone and the
   video is the enhancement.
   **Sizing rule, and it is load-bearing:** if a recorded session runs more
   than about fifteen minutes of wall clock before compression, the toy
   project is too big. **Shrink the project, not the tutorial** — dropping
   steps is how a lifecycle demonstration quietly stops demonstrating the
   lifecycle.
5. **Publication safety pass, before anything leaves the machine.** Every
   prior recording in this set was for internal review; these are destined
   for a public URL, and a public video is unrecallable. Check, per video,
   with a written checklist and a human confirming: window titles, absolute
   paths, repository and remote names, notification toasts, secrets in
   terminal output or environment, the cost and model gauges, open browser
   tabs, the taskbar. **"Do not publish this one" is a valid outcome.**
   Nothing in this session uploads anything.
6. **Cross-provider verification.**
7. **Required portion of the full test suite** — this session drives a
   rendering surface, so Layer 3 is owed (`L-064-12`).
8. **Close-out**, mid-set, with a `next_orchestrator` handover.

**Creates:** pointer visibility on both recorders with its falsifier, the long-form capture harness, the event-derived speed-ramp, the single-module tutorial recordings and its written walkthrough, the publication safety checklist
**Touches:** extension `scripts/`, `ai_router/`, `docs/tutorials/`, `docs/walkthroughs/`
**Ends with:** every recording this framework makes shows a pointer that moves, and a watchable single-module tutorial exists as one video per session, with the waiting compressed out and the compression stated.
**Progress keys:** `pointerVisible`, `recordingPipeline`, `singleModuleRecorded`, `safetyPassRun`

---

### Session 8 of 8: The multi-module tutorial, and the set's accounting

**Added 2026-08-16 on operator direction.** The second tutorial, and the
**set-terminal** session — it inherits `change-log.md`, the Step 9 review
and this set's own UAT accounting from Session 6.

> **AMENDED 2026-08-16, after Session 7's measurement and the operator's
> adjudication on it.** **This session's recordings are blocked by exactly
> what blocked Session 7's**: no capture backend draws a cursor, and the
> authorised route (`gdigrab` over the window's desktop rectangle) is a
> reserved follow-on set gated behind a measurement pass, deliberately not
> this one — Session 8 is set-terminal and carries the whole set's
> accounting. So Session 8 **authors** the multi-module tutorial exactly as
> Session 7 authored the single-module one, and **records nothing**. Both
> tutorials' videos are owed to the reserved set. The written walkthroughs
> stand alone with no video, which is spec decision 4 and is what makes
> this an acceptable end state rather than a deferral of the deliverable.
> Session 8 also owes the set's UAT accounting for all seven declared
> components — including the one that must **not** default to `none`,
> because the operator watched the Session 4 pilot recording on 2026-08-16
> and returned a finding: a developer, count 1, method `watched`.

**Steps:**

1. Register.
2. **Record the multi-module tutorial:** a purpose-built toy repository with
   **three modules, one session set each**, individual sessions as
   individual recordings, waiting compressed out. **Reuse Session 7's
   harness unchanged.** If it cannot be reused unchanged, say plainly what
   had to generalise and why — that is the signal that the capability was
   fitted to one example, and it is worth more written down than worked
   around.
   **It must show what the single-module tutorial cannot**, or it is the
   same video three times at three times the cost: module declaration, the
   Explorer grouped by module, review routed by ownership, and work
   proceeding **in parallel** across modules while nobody waits. If those
   four are not visible on screen, this session has produced a longer video
   rather than a second tutorial.
3. **Clear each video for publication, and build no pipeline.** Session 7's
   safety checklist, run again **per video** — not once per set, because
   the risk is per artifact. Then record the conventions rather than the
   machinery: publication stays a human upload (operator, 2026-08-10), the
   product version belongs in the title, and a stale video is
   **regenerated, not patched**. Note in the reservation record that the
   *Training Publication and Retention* trigger has fired — a public
   audience now exists — without treating that as licence to build it here.
4. **Cross-provider verification.**
5. **Required portion of the full test suite** — the full matrix once, at
   the release boundary.
6. **Close-out**, set-terminal. The UAT accounting covers **all seven
   declared components**. One record is already owed and must not default
   to `none`: the operator **watched** the Session 4 pilot recording on
   2026-08-16 and returned a finding, which is a developer, count 1, method
   `watched` — a real human review, the set's first, and not a manual walk.

**Creates:** the multi-module tutorial recordings and its written walkthrough, the set's UAT accounting, the change log, the Step 9 review
**Touches:** `docs/tutorials/`, `docs/walkthroughs/`, the set directory
**Ends with:** two publication-ready tutorial video sets exist, the set's record says per component what a human actually did, and nothing this set built is closed over silently.
**Progress keys:** `multiModuleRecorded`, `moduleDistinctivesShown`, `safetyPassRun`, `setAccountingWritten`

---

## End-of-set deliverables

- A UAT record that states, per component, what was done and by whom — with
  an omitted component impossible to close over.
- One authored scenario rendering a manual walkthrough, a training
  document, captions and chapter metadata, with a test that they cannot
  diverge, all usable with **no video**.
- A browser recording path proved on a web fixture, emitting a step-event
  stream and an artifact-agnostic run manifest into ignored output.
- A measured verdict on Windows OS-level capture, and the optional recorder
  only if it earned it.
- A measured answer on whether the capture dependencies can be isolated, and
  what that isolation costs in fidelity.
- The automated path-aware critique reaching two providers, or the reason it
  cannot, written where the next session will find it.
- A visible, moving pointer in every recording this framework makes, proved
  against recorded frames rather than against a flag.
- Two publication-ready tutorial video sets - one single-module repository
  across three session sets, one multi-module repository with three modules
  and a set each - recorded per session, with the waiting compressed out by
  a plan derived from the framework's own timestamps, and each video
  cleared by a written publication safety pass.
- Reservations for the follow-on sets, with their triggers stated.

## Follow-on sets to reserve, not to build here

> **Two reservations were promoted into this set on 2026-08-16**, on
> operator direction, and are therefore **no longer reserved**: sandboxing
> the capture dependencies became **Session 5**, and the pull-critique
> transport failure became **Session 6**. The full reservation record,
> including the three that remain reserved and their triggers, is
> [`docs/proposals/2026-08-15-set-113-follow-on-reservations.md`](../../proposals/2026-08-15-set-113-follow-on-reservations.md).

- **Independent Black-Box UI Critique** — provider-diverse exploratory web
  E2E against the common-mode self-verification failure. Web-only to start;
  reviewer gets acceptance criteria approved *before* implementation and a
  persona, but not the diff, tests, rationale or the authored path; it must
  choose its own route; evidence required per finding; **no finding quota**;
  calibrated with seeded defects, because *"if it cannot detect
  representative broken states, a clean run is not evidence."* Output is
  advisory, and never counts as a human reviewer.
- **Terminal Walkthroughs and Cast Artifacts** — PTY/cast recording,
  normalized transcripts, secret redaction, TUI semantics. **Trigger:** a
  real terminal target exists.
- **Training Publication and Retention** — external storage, product-version
  association, discoverability, accessibility review, retention and
  stale-content policy. **Largely pre-empted by the operator, 2026-08-10:**
  sub-minute videos uploaded by hand to an existing SharePoint library or
  Teams channel supply storage, discoverability, access control, retention
  and (via Stream) captions without a pipeline. **Trigger narrowed:** a
  public or non-org audience needs durable video, or videos outgrow manual
  upload. Until then the conventions are — product version in the title, and
  a stale video is regenerated rather than patched.
- **Non-Web Walkthrough Backends** — native desktop or 3270 driving and
  capture. **Trigger:** an actual product supplies requirements.
- **A Capture Backend That Draws The Cursor** — **reserved 2026-08-16 on
  operator adjudication, and its trigger has already fired.** Session 7
  measured three backends against two instruments
  (`s7-cursor-capture-backends.json`): OBS window capture on WGC puts the
  workbench in frame and **no cursor at all**, OBS BitBlt draws the cursor
  onto a **black frame** because it cannot read a hardware-accelerated
  Electron surface, and only `ffmpeg gdigrab -i desktop` over the window's
  rectangle produces both. The operator authorised the `gdigrab` route
  **gated behind a measurement pass against the Session 4 pilot's seven
  criteria** — not a swap. Two of those criteria are where a desktop
  rectangle is weakest and are the point of the pass: **C2**, because a
  rectangle takes whatever comes to the front into the frame, and
  window-follow, because it does not track a window that moves. Both matter
  more than usual here: these videos are destined for a public URL.
  **This set does not build it**, and the placement is deliberate — Session
  8 is set-terminal and carries the whole set's accounting, and the S4
  pilot that wrote those seven criteria was itself a session.
  **It owes: the long-form human-driven capture harness (Session 7 step 3),
  and the recordings for BOTH tutorials** — this set produces the two
  written walkthroughs, which stand alone (spec decision 4), and neither
  set of videos.

## Risks this set should expect

- **The driver is the expensive part, not the capture.** Round 3's sharpest
  correction, and it lands on the operator, the earlier consults and this
  spec's first draft equally: the capture backend — OBS or ffmpeg — records
  whatever is on screen, but something still has to *make the application
  do things*. Playwright
  already drives browsers; nothing drives an arbitrary desktop app. Never
  reason about capture without pricing the driver.
- **Narration is authoring work, not engineering work.** Writing steps a
  non-technical reviewer actually understands is the hard half. Budget for
  it.
- **Browser recording is not as complete as it sounds.** It generally omits
  browser chrome, native file pickers, permission prompts, external
  applications and some authentication transitions. A web workflow can still
  cross the browser/OS boundary.
- **Session 4 is the one most likely to eat the roadmap.** The operator's
  standing complexity budget — *"this could quickly become dozens of sets
  with thousands of lines of code"* — binds hardest here. The pilot's value
  is the measurement; shipping a recorder is the optional upside.
- **Sessions 7 and 8 are the roadmap risk now, not Session 4.** Session 4's
  budget was bounded by a measurement that ends either way; a tutorial is
  bounded by nothing except the authoring taste of whoever writes it, and it
  is recorded in real time against a capacity-constrained engine seat. The
  sizing rule in Session 7 step 5 is the brake, and the brake only works if
  the project shrinks rather than the tutorial.
- **These are the first artifacts this set makes that cannot be recalled.**
  Everything before them was for internal review, where a mistake is fixed
  by re-recording. A video on a public URL has been seen. The safety pass is
  load-bearing, not polish, and it is per video.
- **A tutorial can drift from the product in a way a scenario cannot.** The
  scenario renderings are gated by a divergence test; a recording of a human
  driving a real session has no such gate, and the only honest answer is the
  convention this set already chose - the product version in the title, and
  regeneration rather than patching.
- **This set's deliverable is judged by taste.** The word to beat, from Set
  111, is "pleasurable" — and the operator's bar is that the reviewer does
  very little work and still gains confidence.
