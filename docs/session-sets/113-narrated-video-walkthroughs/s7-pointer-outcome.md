# Session 7 — showing the pointer: what was fixed, and what the fix uncovered

**Status: the web path is done and proved. The VS Code path's driver is
done and proved, and its *capture* turns out to be broken in a way the
diagnosis had ruled out.** That second half needs an operator decision
before the tutorial recordings can be worth making, which is precisely what
the ordering ruling of 2026-08-16 exists to prevent — *"we should get the
cursor functionality working before recording the purpose-built new
tutorials."*

---

## The operator's observation, and what the diagnosis said

> *"So far, they look great, but I believe that there is a way to show the
> cursor moving. If so, we should enable that."* (2026-08-16)

The diagnosis that followed, in `operator-notes.md`, was:

- Cursor capture was already on — `obs-capture.js` created its input with
  `cursor: true`, and the ffmpeg fallback passed `-draw_mouse 1`.
- **Nothing moved the pointer**, because Playwright's `locator.click()`
  synthesises input through the debug protocol.
- So the work is *driver* work, in two shapes.

The first two are correct. The third is correct for the web path and **half
correct for the VS Code path**, and the half that was wrong is the half
that decides whether the operator sees a moving cursor.

---

## The web path: done, and proved in the artifact

`scripts/pointer.js` draws a synthetic pointer into the page and walks it to
each action's target before acting. This is the only mechanism available
there: Chromium's `recordVideo` composites no system cursor under any
circumstance, so moving a real pointer over the browser would change
nothing in the file.

The proof is in the recording, not in a unit test:

| | pointer on | control (`--no-pointer`) |
|---|---|---|
| probes | 6 | 6 |
| passed | **6** | 0 |
| change at the target | 5.2% – 9.1% of the crop | **0.00000, every probe** |
| change in the control region | 0 | 0 |

Artifacts: [`s7-pointer-visibility-web.json`](s7-pointer-visibility-web.json)
and [`s7-pointer-visibility-web-control.json`](s7-pointer-visibility-web-control.json).

**The control is a real falsifier, not a formality.** `--no-pointer` takes
the identical path through the recorder, waits the identical time, and emits
an identical probe list — it differs in drawing a pointer and in nothing
else. So the check has to fail on the *pixels*, and it does.

### The first version of this check passed the control

Worth recording, because it is the failure L-112-1 describes and it was
caught only by running the falsifier. The instrument compares the target
region at the instant before the pointer set off against the instant it
arrived. In the first version both instants landed in a window where the
page was doing other things — the emphasis dimming was still fading and the
next action's typing had already begun — so a band of the crop changed
whether or not a pointer existed, and the control scored up to 17%.

Two fixes, both of which the recording wanted anyway:

1. **The page is held still on both sides of both instants.** A cursor that
   lands, pauses and then clicks also reads as deliberate rather than as a
   machine.
2. **The checker derives the gap between the run's clock and the video's
   own zero** (about 200 ms here: the run's last event is at 44,139 ms and
   the file is 43,960 ms long) instead of assuming they are the same.

---

## The VS Code path: the driver works

The real Windows pointer is now walked to each target before the synthesised
click. It is opt-in (`--physical-pointer`), it announces the takeover on the
console before anything moves, and it restores the entry position on every
exit path including failure — the restore runs first in the `finally`, with
a one-shot call that does not depend on the driver process still being
alive.

Coordinates are **calibrated, not computed**. The arithmetic version —
`(window.screenX + x) * devicePixelRatio` — has three independent ways to be
wrong (workbench zoom, a second monitor at another scale, a helper process
that is not DPI-aware), and all three fail by landing the pointer somewhere
plausible. Instead the pointer is moved to three known screen points, the
`clientX/clientY` the renderer reports for each resulting *real* mousemove is
read back, and scale and offset are solved from two of them and **checked
against the third**. On this machine: scale 1.000 × 1.000, origin (240, 90),
residual **0 px**, six probes recorded.

Three defects were found getting there, and each of them failed silently:

1. **The driver read its own script from the stream it needed for
   commands.** Piping the loop into `powershell -Command -` makes PowerShell
   read the script from stdin — the same pipe the loop then reads move
   commands from. It started cleanly, moved nothing, and printed no error.
   It runs as a `-File` script now.
2. **Its type compilation was still running when the first moves arrived.**
   `Add-Type` compiles C# on first use and takes one to three seconds; every
   move written in that window sat in the pipe. The symptom was a
   calibration that partly succeeded, which is worse than one that fails.
   The driver now announces itself ready and the caller waits.
3. **Real pointer motion goes to whatever window is IN FRONT**, not to the
   window that asked. The first run's events went to a OneNote window the
   operator had left open. `focus()` is not enough — Windows refuses
   `SetForegroundWindow` to a process that is not already foreground — so a
   pointer run sets the workbench always-on-top and puts it back afterwards.
   When it still cannot get through, the error now names the window that is
   in the way instead of blaming the coordinates.

---

## The VS Code path: the capture does not draw a cursor

With the driver working, the recorded frames still contain no cursor. So the
premise was measured rather than repeated:
[`s7-cursor-capture-backends.json`](s7-cursor-capture-backends.json). Park
the real pointer at a known point over the workbench, take one frame from
each candidate backend, and ask two questions — is the window in the frame
(correlation against a Playwright screenshot of the same window), and is the
cursor in the frame (does a parked frame differ locally from a moved-away
one).

| backend | window present | cursor present |
|---|---|---|
| OBS window capture, **WGC** — what the recorder ships with | **yes** (0.9996) | **no** (0.00000) |
| OBS window capture, **BitBlt** | **no** (0.0000 — black frame) | no |
| **ffmpeg `gdigrab`** over the window's desktop rectangle, `-draw_mouse 1` | **yes** (0.9697) | **yes** (0.124) |

Read plainly:

- **WGC ignores the cursor setting.** It has been `true` on all
  twenty-four of Session 4's captures and it did nothing, which is why
  nobody could see the problem from the settings.
- **BitBlt honours the cursor setting and black-frames the window.** This
  is not a surprise — `obs-capture.js`'s own comment says WGC was chosen
  because it "does not black-frame on hardware-accelerated Electron". An
  isolated probe of BitBlt showed an arrow on an otherwise entirely black
  frame: the cursor without the product.
- **Only `gdigrab` produces both**, because it reads the composited desktop
  rather than a window's own surface.

So the pointer visibility measurement on the VS Code path
([`s7-pointer-visibility-vscode.json`](s7-pointer-visibility-vscode.json))
reports **FAIL** — honestly. The pointer is where it should be and the file
does not show it.

---

## What was deliberately NOT done

**A capture backend was not swapped.** Moving the VS Code path to `gdigrab`
would answer the operator's request, and it is a *backend* change:

- The Session 4 pilot set seven criteria for judging a capture backend
  (window selection under a decoy, no unrelated desktop pixels, resolution
  under display scaling, event/caption alignment, clear failure when the
  dependency is absent, deterministic cleanup, occlusion). **None of them
  has been evaluated against `gdigrab`**, and two of them are exactly where
  a desktop-rectangle capture is weakest: it captures a *rectangle of the
  desktop*, so anything that comes to the front — an alert, a notification,
  another window — lands in the frame, and it does not follow a window that
  moves.
- The spec's own words for `gdigrab` are *"a PROBE, NOT A SECOND
  BACKEND."*
- The recorder is **gated closed** anyway: the pilot's verdict is FAIL and
  no operator waiver exists, so this would be building a second backend into
  something nobody has yet decided may record at all.

Shipping it unmeasured would repeat exactly the mistake this whole set was
built to avoid. The measurement is the deliverable; the decision is the
operator's.

---

## What this blocks, and what it does not

**Blocked:** the VS Code half of the pointer work, and with it the tutorial
recordings — which record a real VS Code window and would, today, show
controls operating themselves. The ordering ruling says not to record them
in that state, and that ruling is right.

**Not blocked:** everything portable. The web recorder shows a moving
pointer now, proved. The speed-ramp pipeline is finished and proved on real
data. The publication safety checklist is written. The tutorial's toy
project and its written walkthrough are authored and stand alone — the
written artifact is the durable deliverable and the video is the
enhancement (spec decision 4), so the documents are not waiting on a
capture backend.
