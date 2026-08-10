# Set 113 — narrated video walkthroughs, and UAT that is worth doing (RESERVED)

> **Status:** proposed and reserved by the operator, 2026-08-08, during
> Set 111 Session 4's UAT stop. Spec authored the same day at
> [`docs/session-sets/113-narrated-video-walkthroughs/spec.md`](../session-sets/113-narrated-video-walkthroughs/spec.md).
> **Execution waits for Set 112 to complete** (operator sequencing
> decision, 2026-08-08). This document is the reservation record, the
> problem statement, and the measured feasibility basis; the spec
> executes it.
>
> **Superseded in part, 2026-08-10.** The spec was restructured from three
> sessions to four after the operator recorded new direction and three
> pre-set consult rounds ran. Several "open questions" below are now
> settled, and one conclusion below is **narrower than it reads** — see
> the correction note at the end of the feasibility section. The spec and
> [`operator-notes.md`](../session-sets/113-narrated-video-walkthroughs/operator-notes.md)
> govern; this document remains the historical reservation record.


## The problem, in the operator's words

> *"I want to do UAT, but the experience has to be good. In the past, it
> has been awful. In the past, the instructions have been way too
> difficult to decipher and often too involved. Often, the setup is too
> involved."*

This is a **measured** failure mode in this repo, not a preference. The
evidence Set 111 already collected:

- Set 110 Session 2 closed **without its UAT walk**, and nothing noticed.
  The operator, naming the pattern directly: *"We often bypass UAT. I
  haven't complained because it totally sucks, but we shouldn't bypass
  it."*
- Set 111 S4 built the `requiresUAT` close gate specifically because the
  failure mode is **evaporation** — not a decision to skip, but the walk
  simply not happening.
- A gate makes skipping visible. It does **not** make walking pleasant.
  Set 113 is the other half: a gate that forces an unpleasant activity
  produces waivers, and a waiver rate near 100% is a gate that has been
  routed around rather than satisfied.

Set 111 S4 removed the *staging* half of the cost — `npm run walk` now
builds a disposable workspace, launches an isolated Extension
Development Host, and opens the Dabbler view with no operator steps at
all. What remains is the *comprehension* half: reading step instructions
and deciding what "right" looks like.

## The proposal

**Narrated video walkthroughs, with an optional "now you try" manual
walkthrough generated from the same source.**

1. An **automated walkthrough script** drives the real product through a
   short scenario.
2. The run is **recorded to video**, with **captions** describing what is
   happening in non-technical language, at two levels: what this
   accomplishes (high level) and what is being clicked and typed
   (click-and-enter level).
3. The reviewer **watches** — which is where most UI feedback comes from
   and costs almost nothing.
4. Each video offers **"repeat it yourself"**: the same fixture, already
   staged, and the same steps rendered as a short manual walkthrough, so
   the reviewer performs one or two mini-workflows and gains real
   confidence.
5. **Many short videos** beat one long one.

**One source, two outputs.** The step list is authored once and renders
both the narration and the manual walkthrough. This is the load-bearing
design constraint: a video and a hand-written instruction sheet that
drift apart are worse than no video, because the reviewer trusts the
video and then fails to reproduce it.

**Scope is cross-cutting.** The operator's framing: *"for all
applications moving forward, not just the orchestrator."* This lands in
`ai_router` / the shared extension so consumer repos inherit it, not in
one repo's test folder.

## Feasibility — measured 2026-08-08, not assumed

The obvious implementation does **not** work, and it is worth recording
so Set 113 does not spend a session rediscovering it.

**Experiment.** The same launch script, run twice against the real
Extension Development Host on the UAT fixture workspace, differing only
in whether Playwright's built-in `recordVideo` option was passed:

| Run | `recordVideo` | Outcome |
| :--- | :--- | :--- |
| A | `{ dir, size: 1280x800 }` | `firstWindow()` resolves to a window with an **empty URL**; no window ever exposes `.activitybar`; the automation cannot drive the workbench; **no video file written** |
| B | omitted | workbench window found immediately (`vscode-file://vscode-app/...`), `.activitybar` visible, Work Explorer tree rows present, clicks drive the real UI |

**Conclusion.** Playwright's Electron video recording does not attach
usefully to a VS Code workbench window; passing it breaks the very
automation that would be recorded. Run B is the important half of the
result: **the automation itself works today** — the existing Layer 3
harness (`electronLaunch.ts`) already launches, finds, and drives the
real UI, and Set 111 S4's `scripts/vscode-launch.js` shares that machinery
with the walk stager.

**The viable path** is therefore OS-level screen capture wrapped around
the existing automation, rather than in-process recording:

- Windows: `ffmpeg -f gdigrab` against the launched window.
- **ffmpeg is not currently on PATH** on the operator's machine; adding
  it is a dependency decision, and a portability question for consumer
  repos and CI.
- Captions are best authored as **timed text emitted by the walkthrough
  script itself** (each step announces its own caption with a timestamp),
  then burned in or shipped as a sidecar `.vtt`. This keeps narration
  generated from the same source as the steps, satisfying the
  one-source-two-outputs constraint above.

> **Correction, 2026-08-10 — this conclusion is narrower than it reads.**
> The experiment measured `recordVideo` against a **VS Code workbench
> window**. It says nothing about `recordVideo` in an ordinary browser
> context, which all three 2026-08-10 consult rounds identified as the
> **primary** recording path for the products this framework actually
> builds (.NET / Java / vanilla JS / Python web apps). The restructured
> spec therefore makes **browser recording the primary path** and treats
> OS-level capture as a **bounded, measured pilot** for this repo's own
> Electron-hosted product — not as the starting point.
>
> A second correction, from the round-3 critical review: this section
> reasons entirely about **capture** and never prices the **driver**.
> ffmpeg records whatever is on screen, but something must still drive the
> application. Playwright already drives browsers; nothing drives an
> arbitrary desktop app. *"Capturing pixels is the easy part; reliably
> staging and driving an arbitrary desktop application is usually the
> expensive part."*


## Open questions for the spec to settle

> **Status 2026-08-10:** questions 1–4 are settled or reframed by the
> restructured spec and the operator's rulings; question 5 is settled by
> the "many short scenarios" decision. Kept here as the historical record
> of what was open at reservation time.

1. **Recording dependency.** ffmpeg bundled, documented-prerequisite, or
   an optional capability that degrades to "manual walkthrough only"?
   Portability rule applies: the core must work without it.
   → **Settled:** optional documented prerequisite, never bundled, never
   in the core; and only after Session 4's bounded pilot earns it.
2. **Where videos live.** Committed binaries bloat a repo permanently.
   Options: generated on demand and gitignored; published as release
   assets; or a short retention window.
   → **Settled:** generated on demand into ignored output, never
   committed. Durable *publication* is a separate reserved set.
3. **Voice narration vs captions.** Captions are cheap, diffable,
   translatable and accessible; synthesized speech is friendlier but adds
   a TTS dependency and is not reviewable in a diff.
   → **Settled:** captions. Voice synthesis is a non-goal.
4. **Does a watched video satisfy `requiresUAT`?** This touches the
   close gate Set 111 S4 shipped, and any *reduction* in verification is
   an operator-held decision under the decision-rights carve-out. The
   likely honest shape: watching records `status: "walked"` only when the
   reviewer also completes the paired mini-workflow, with watch-only
   recorded as its own distinct status rather than quietly counted as a
   walk.
   → **Reframed by the operator, 2026-08-10.** The question is no longer
   "what counts as a walk" but "what did each component actually get, and
   from whom." The gate becomes a **record-completeness** gate; "no UAT"
   is a valid, attested, passing value. Still operator-held; the
   attestation is journaled in Session 1.
5. **How many videos, and how short.** The operator's instinct is "the
   more videos, the better" and "very little time" — which argues for
   one scenario per video, measured in tens of seconds.
   → **Settled:** one scenario each, tens of seconds.


## Why this is its own set

Set 111 S4 was a ceremony pass at its close gate when this came up.
Bolting a recording pipeline onto a session already past code freeze is
exactly the pattern the repo's own guidance warns about, and Set 112 (a
breaking removal release) is already queued and prerequisite-gated. The
operator's sequencing decision, recorded 2026-08-08: **author now, run
after Set 112.**
