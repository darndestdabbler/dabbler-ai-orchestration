# Walkthrough scenarios

> **Canonical for the scenario source format and its four renderings.**
> One authored scenario, four generated documents, and a test that fails
> if they ever stop agreeing. Shipped by Set 113 Session 2.

A walkthrough scenario is one micro-workflow of a product, written once,
in words a reader with no prior context can follow. It renders:

| File | What it is for |
| :--- | :--- |
| `walkthrough.md` | A reviewer drives the product themselves: do this, you should see that. This is the UAT artifact. |
| `training.md` | Someone learning the product reads what it does and why the steps are in this order. |
| `captions.vtt` | WebVTT cues, one per step, keyed by stable step id. |
| `chapters.json` | Chapter metadata — id, title, and the window each step occupies. |

**The written documents are the deliverable; a video is an
enhancement.** Both prose files say so in as many words, neither links a
media file, and both are complete with no recording in existence. That
is what makes the format portable: a consumer repo building a .NET, Java,
Python or vanilla-JS web application inherits the whole thing without
inheriting a recorder.

## Where things live

```
docs/walkthroughs/<scenario-id>/
  scenario.yaml     <- the one source, authored by a human
  walkthrough.md    <- generated
  training.md       <- generated
  captions.vtt      <- generated
  chapters.json     <- generated
```

## Authoring one

Write `scenario.yaml`, then render:

```bash
.venv/Scripts/python.exe -m ai_router.scenario_render docs/walkthroughs/<scenario-id>
.venv/Scripts/python.exe -m ai_router.scenario_lint
```

Commit the source **and** the four generated files. `scenario_render
--check` (run over the whole tree by the pytest suite) fails if a
generated file was edited by hand or if the source moved and nothing
re-rendered. It compares the **text**, not the raw bytes: this repo sets
`core.autocrlf=true`, so a Windows clone lands these files with CRLF
while the renderer emits LF, and a byte comparison would report drift
where none exists. One changed character still fails.

A whole-tree `--check` that finds this directory present but empty
**refuses** rather than reporting success — a corpus gate that passes
having examined nothing reads identically to one that passed having
examined everything.

### The shape

```yaml
id: some-scenario            # lowercase kebab-case, stable forever
title: What the reader will be able to do
summary: One paragraph, in the reader's terms.
audience: Who this is written for, and what it assumes they know.

prerequisites:               # optional
  - What must already be installed or configured.

baseline:                    # required — the known starting state
  description: What the setup does and why it is safe.
  setup:                     # optional — commands that stage it
    - cwd: some/directory
      command: npm run walk
  observable: How the reader knows they have arrived.

reset: How to get back to the baseline.            # optional
recovery:                                          # optional
  - symptom: What the reader sees when it goes wrong.
    action: What to do about it.

steps:                       # required, at least one
  - id: stable-step-id       # lowercase kebab-case, unique
    title: A short label — it heads a section and names a chapter
    action: Exactly what to do.
    expect: Exactly what should then be on screen.
    narration: The caption line.        # optional, defaults to `action`
    seconds: 8                          # optional, defaults to 8
    checkpoint: a name                  # optional — a resumable point
    focus: what the reader's eye should be on   # optional, prose only

drivers:                     # optional — see "The quarantine" below
  playwright-web:            # this driver's own vocabulary, not the model's
    fixture: task-board      # or `url:` for an app you already serve
    viewport: { width: 1280, height: 800 }
    steps:
      stable-step-id:
        emphasize: '#some-id'          # outlined before the action
        do:
          - fill: '#some-input'
            value: what to type
          - click: '#some-button'
        expect: { selector: '#result', text: 'what it should say' }
```

Every key under `drivers:` is validated by **its own driver**, not by the
scenario model — that is the price of the quarantine, and the recorder
pays it: an unknown key, an unknown action verb, an authored step with no
driver detail, and a driver step the scenario does not declare are each
refused by name (`src/test/suite/webWalkthroughRecorder.test.ts`).

Unknown keys are **refused**, not ignored — at the top level and inside
a step. A field nobody validates is how a self-assessed confidence score
or a stray selector arrives without anyone deciding to add it. Adding a
field is a code change, on purpose.

Two more refusals, both aimed at content that would silently disappear:

- **A duplicate key.** YAML's default is last-one-wins with no
  diagnostic, so a second `action:` or a second `steps:` would quietly
  drop everything above it.
- **`-->` in `narration` or `action`.** Both can become a caption, and
  WebVTT reads that sequence as a cue-timing arrow. Write `->` or an em
  dash. (Authored prose that *wraps* is fine — the caption renderer
  flattens it to one line, since a blank line inside a payload would end
  the cue.)

### Write it for a stranger

The bar is the repo's existing one for UAT instructions
(`docs/planning/project-guidance.md` → *UAT is written for a stranger
and pre-verified by automation*): name the exact button labels, menu
paths, file paths and on-screen text. When a step is ambiguous the
reader cannot tell a product bug from their own misreading, and the
walk proves nothing.

**Two things a stranger cannot infer, and both are on you:**

1. **Who this is written for.** `audience` is a promise. If the steps
   need a repository checkout, developer tooling or an internal
   environment, say so there — an audience line broader than the
   prerequisites makes the document unfollowable for exactly the people
   it invited. (Set 113 S2 verification found this on the first exemplar,
   from two independent lenses.)
2. **Where the commands are run from.** A `baseline.setup` entry's `cwd`
   is relative to *something*, and nothing in the rendered document says
   what. Name the starting directory in `prerequisites` or
   `baseline.description` — "run these from the root of your clone, the
   folder containing `ai_router/` and `tools/`" — and add a `recovery`
   entry for the error a reader sees when they are in the wrong folder.

### Keep it under a minute

The renderer warns above 60 seconds of authored time and never refuses.
It is a design check, not a limit: a scenario that cannot be told in a
minute is usually two scenarios. It also matches the operator's hosting
convention — sub-minute files uploaded by hand to SharePoint or a Teams
channel, product version in the title, regenerated rather than patched
when they go stale.

## The quarantine

Everything above `drivers:` is **portable**: it says what a human does
and what they should then see, and nothing about how a machine finds the
button. Everything under `drivers:` is target-specific — Playwright
selectors, launcher paths, whatever a particular backend needs — and:

- `render_all` hands each renderer a **copy with `drivers` emptied**, so
  no renderer can read it even by mistake;
- the `portable-digest` stamped into all four documents is taken over the
  portable half only.

So **replacing the entire driver block leaves all four generated
documents identical**, which is asserted by
`ai_router/tests/test_scenario_render.py` — including a test that a
renderer is literally handed no drivers at all, so the guarantee is a
property of the call rather than of what today's renderers happen to
read. That is the seam the Set 113 consults named as the one that
matters; a published recorder-plugin contract was rejected as premature
abstraction, and driver blocks are deliberately opaque until a second
real driver exists to disagree about the shape.

`ai_router.scenario_lint` is the second line: it flags selector-shaped
text that leaked into the portable half. It is **advisory** — a pattern
gate over free prose has a false-positive surface, and a renderer that
refused to run over a sentence resembling CSS would be routed around
rather than satisfied. The pytest suite asserts the committed corpus is
clean, which is where the rule bites.

One known false positive, and the fix that improves the prose anyway: a
bare hyphenated dotfile (`.vscode-test`, `.code-workspace`) is shaped
exactly like a CSS class. Write it path-qualified —
`tools/dabbler-ai-orchestration/.vscode-test/` — which also tells the
reader where the folder actually is.

## Reaching a particular step

**There is no seek bar, and the documents never imply one.** The
operator cut the synced-window idea on 2026-08-10 with one condition:
very clear step-by-step instructions to reach any point. Honestly read,
that means replaying a documented prefix from the known baseline, or
from the nearest named `checkpoint` before the step — the product is
stateful, and pretending otherwise would hand a reviewer instructions
that cannot work. Both prose documents say this in the same words, and
`walkthrough.md` renders a *Where to start* table listing each
checkpoint and what remains to replay from it.

Author a `checkpoint` wherever a reader could reasonably stop, and keep
the replay from it short.

## What this is not

- **Not a video pipeline.** Nothing in the *scenario format* records,
  encodes, uploads or stores anything. Set 113 Session 3 added an
  optional browser recorder (below) that writes into ignored output;
  Session 4 measures whether Windows OS-level capture is viable at all.
  Both are optional, and their absence costs a reader of these documents
  nothing.
- **Not a driver.** Nothing here makes an application do anything. That
  is the expensive half, and it is deliberately not solved in general —
  Playwright drives browsers, and nothing drives an arbitrary desktop
  application.
- **Not a library of scenarios.** Set 113 authors exactly one exemplar.
  New scenarios arrive when a real product workflow needs one.

## Recording one

**Optional, on demand, and never in CI.** A recording is an enhancement;
the documents above are the deliverable.

**What recording needs, beyond what the walkthrough itself needs.** The
written walkthrough needs only what its own `prerequisites` say. The
*recorder* additionally needs two things, and neither is implied by the
other:

1. **Node dependencies** — `npm install` in
   `tools/dabbler-ai-orchestration`, which is what supplies Playwright and
   its browser.
2. **A Python interpreter that can import `ai_router`** — the recorder
   asks it for the scenario rather than parsing YAML itself, so that this
   repository keeps exactly one scenario parser. A checkout with
   `pip install -e .` gives you one; a consumer repository that installed
   `dabbler-ai-router` from PyPI already has one on `PATH`. Set
   `DABBLER_PYTHON` to override which is used. The recorder probes each
   candidate by actually importing the package and names all of them if
   none works.

From `tools/dabbler-ai-orchestration`:

```bash
npm run walkthrough:web                              # the bundled fixture
npm run walkthrough:web -- --url http://localhost:5173   # your own app
npm run walkthrough:web -- --no-video                # the degraded path
```

One command drives the real UI, records it, and writes a run directory
into gitignored `.walkthrough-runs/<scenario-id>/`:

| File | What it is |
| :--- | :--- |
| `events.jsonl` | The step-event stream — `run-started`, then `started` / `completed` / `failed` per stable step id, then `run-finished`. Written by the driver. |
| `driver-output.json` | What the driver saw: target, timing anchor, and any artifacts it produced. Written by the driver. |
| `manifest.json` | The validated record of the run: one entry per **authored** step, and zero or more typed artifacts. Written by `walkthrough_run finalize`. |
| `captions.vtt` | The caption sidecar, retimed from the stream. Written only when there is a video for it to sit under. |
| `index.html` | A self-contained page: the recording, the steps, and what happened. Written by `walkthrough_run finalize`. |
| `recording.webm` | The video, when there is one. |

**A consumer repo changes the URL and nothing else.** The recorder drives
a browser, so the .NET, Java, Python and vanilla-JS web applications this
framework is used to build are one target, not four. Point `--url` at a
dev server already running, or author `url:` in the scenario's
`playwright-web` driver block instead of `fixture:`.

### What the manifest is for

It can reference **zero or more artifacts, of any kind** — browser video,
OS video, terminal cast, captions, screenshots, a transcript, the index —
each with an explicit media type. Nothing anywhere assumes an MP4, and
Session 3's own recordings are WebM. **An empty artifact list is valid:**
failure to record must never fail the walkthrough, so a run that captured
nothing still produces a manifest, an index that says so where the player
would be, and a truthful account of every step.

The manifest also carries one record per **authored** step, so a run that
stopped at step 3 reports steps 4 and 5 as `not-reached` rather than
omitting them. That is Session 1's finding one layer down: a report
assembled from whatever records exist makes an omitted item look
identical to a passing one.

### Captions you can actually see

The generated `index.html` is meant to be opened straight off disk, and
Chromium refuses to load a caption sidecar **element** over `file://` —
it treats it as cross-origin. A page that linked `captions.vtt` that way
would look correct in the markup and show no captions on its own
documented viewing path. So the cues are embedded in the page and added
through the standard `addTextTrack` / `VTTCue` API on load: the browser
renders them with its **own native caption UI**, the player's caption
button works, and nothing is fetched.

`captions.vtt` is still written and still listed as an artifact — it is
the sidecar you upload beside a copy of the video, which is what the
SharePoint/Teams convention wants. The page simply does not depend on
being able to read it.

### Timing, honestly

Recording starts inside `newContext()` and nothing reports the exact
instant. The driver brackets that call and records the width of the
bracket as `anchor.uncertaintyMillis` (single-digit milliseconds in
practice), rather than implying a frame accuracy it does not have. Cue
times come from the run, not from the authored `seconds` — those are a
floor the driver holds each step on screen for, and real driver latency
drifts past them cumulatively.

A recording is tied to the `portableDigest` of the scenario it was made
from, and `finalize` refuses to assemble a run whose scenario has moved.
A stale recording is regenerated, never patched.

### Emphasis, not zoom

Before each step's action the driver outlines the target element and dims
the rest, then **releases the emphasis as soon as the action has run** so
the result is on screen at full brightness. The stylesheet is injected by
the driver, not carried by the page — a consumer cannot add CSS to their
own running application. There is no capture-time zoom and there is not
meant to be (operator ruling, 2026-08-15): post-processing zoom is
deferred until a real reviewer says the videos are hard to follow, which
is why each step's target bounding box is recorded in the stream even
though nothing reads it yet.

### The awkward host: recording VS Code itself — NOT APPROVED FOR USE

**Windows only, internal, and currently ungated by an operator decision.**
Everything above is the portable path and covers every target that reaches
a browser. This is the exception that proves why the seam exists:
Playwright's `recordVideo` was measured to break the **VS Code workbench**
specifically, so the one product this framework cannot record with the
portable path is its own.

> **Status: the Session 4 pilot's verdict is FAIL**, on two of its own
> criteria — see
> [`s4-os-capture-outcome.md`](../session-sets/113-narrated-video-walkthroughs/s4-os-capture-outcome.md).
> A failed pilot ships no recorder, so **the command refuses to capture**.
> It is not an `npm run` entry either, because a registered script is
> indistinguishable from a shipped feature. This is a gate rather than a
> warning: a notice that printed and then recorded anyway would leave the
> release decision advisory instead of enforced.

```bash
node scripts/record-vscode-walkthrough.js              # REFUSES: verdict is FAIL
node scripts/record-vscode-walkthrough.js --no-video   # runs -- captures nothing
npm run pilot:os-capture                               # reproduces the measurement
```

**Two routes unlock capture**, and neither is available to a session on its
own authority: re-measure to a `PASS` verdict, or commit an operator waiver
at `docs/session-sets/113-narrated-video-walkthroughs/s4-operator-waiver.json`
carrying `waivedBy` and `attestation`.

**OBS Studio is a documented optional prerequisite. It is never bundled**,
and "OBS absent" is a supported outcome rather than an error to engineer
around — the run still drives the UI, still writes a manifest and an index,
and says plainly that there is no recording. Three things have to be true
before a recording happens, and each one failing is reported by name:

1. **OBS Studio is installed** (28 or newer, which is when obs-websocket
   became bundled).
2. **Its websocket server is enabled** — in OBS, *Tools → WebSocket Server
   Settings → Enable WebSocket server*. **You do this once, yourself**, and
   the recorder will not do it for you: "OBS installed with its websocket
   off" is a supported missing-dependency state, and a tool that silently
   rewrites another application's configuration is not a documented
   optional prerequisite. (Only the pilot harness enables it, and it
   restores the file byte-for-byte.) Passing `--websocket_port` on OBS's
   command line overrides the port but does **not** enable the server,
   which is a trap worth knowing: OBS logs the override and then never
   listens.
3. **Exactly one Extension Development Host window is open.** The recorder
   enumerates every window OBS offers and **refuses** when more than one
   matches, rather than taking the first — on a developer's machine there
   is routinely a second `Code.exe` window, and silently recording the
   wrong one is worse than not recording.

**No capture failure costs you the walkthrough.** Whatever goes wrong —
OBS missing, websocket off, password rejected, more than one matching
window, a recording that will not start or will not stop — the run drives
every step, writes its documents and its manifest, and reports why there is
no video. That is measured rather than claimed: the pilot induces a failure
at each of the three points a capture can fail and asserts the walkthrough
survives all three.

The recorder builds its **own** OBS scene collection and profile, uses
them, and removes them afterwards. It does not touch your existing OBS
setup, it captures **only** the window it launched, and it never captures a
monitor. That last point is not decoration: a default OBS scene collection
routinely carries a webcam and a microphone, and borrowing one would put
both into a recording nobody asked for.

**What it does not do**, deliberately: no in-page emphasis (the workbench is
another product's DOM, and injecting a stylesheet into it is the sort of
cleverness that breaks on their next release), and no zoom at any stage.

### Measured, not assumed

`node scripts/measure-browser-record.js` reruns the control experiment
this path is built on: the same probe against the same fixture, twice,
differing only in whether Playwright's `recordVideo` was passed. It exits
non-zero if recording ever starts costing the automation again. The
result inverts the VS Code workbench finding (proposal 2026-08-08), which
is why that finding is platform-specific and must not be generalised.

## The exemplars

- [`work-explorer-first-look/`](work-explorer-first-look/) — reading where
  every session set stands, off the AI Work Explorer tree, on the
  disposable fixture project that `npm run walk` stages. Its driver block
  is `implemented`, and `scripts/record-vscode-walkthrough.js` is what
  drives it — see the *not approved for use* note above before relying on
  anything it produces.
- [`task-board-first-task/`](task-board-first-task/) — adding, completing
  and filtering a task on a deliberately tiny sample web page. Its driver
  block is `shipped`, and it is what Session 3 actually recorded.

> The exact running time is not repeated here on purpose. It is derived
> from the source and rendered into all four documents; restating it in
> prose gives it somewhere to drift, which is the defect this whole
> directory exists to prevent. (It drifted 44 → 46 within one session.)
