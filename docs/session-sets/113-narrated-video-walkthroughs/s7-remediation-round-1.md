# Session 7 — remediation for rounds 1 and 2

Ten findings in the discovery pass and one in the supplementary pass. The
two discovery lenses raised the same five issues each, so this is **six
distinct findings**: 1/6, 2/8, 3/9, 4/7, 5/10, and the supplementary one.

Four are fixed. Two are **not fixed and are not fixable in this session**;
they are stated below with what actually blocks them, because reporting them
as fixed would be the failure this whole set exists to prevent.

---

## Fixed

### F1 — findings 1 and 6: the physical pointer selected a backend measured to black-frame VS Code

**The finding is right, and this was a regression I introduced in this
session.** Having measured that BitBlt is the only OBS window-capture method
whose `cursor` setting does anything, I wired `--physical-pointer` to select
it — and the *same measurement* shows BitBlt returns an entirely black frame
for a hardware-accelerated Electron window. So enabling the pointer made the
recording strictly worse: it traded a video with no pointer for a video with
no product.

**Fix, by removal rather than addition (G-005):** the `needCursorVisible`
backend switch is gone from `obs-capture.js` and from its call site.
`CAPTURE_METHOD_BITBLT` is deleted and replaced by a comment stating the
measurement, so the next person to notice that BitBlt honours the cursor
setting does not re-add it. WGC is the only method again.

**And the recorder now says the thing that is true.** A pointer run with
capture on prints, before it starts, that no OBS window-capture method
composites the cursor — WGC ignores the setting, BitBlt black-frames the
workbench — and that the pointer will move but this recording will not show
it. An operator who asked for a visible cursor is told by the thing they ran,
not by a document.

### F2 — findings 2 and 8: the checker could pass without a cursor being visible

**Right, and it names the case the instrument actually met.** A VS Code row
that raises a **hover tooltip** scored 6.5% on a recording with no cursor in
it anywhere. A tooltip is a *consequence* of the pointer being there, which
is what makes it tempting, and it is not a pointer.

**Fix:** the check no longer asks only *how much* changed. `changedRegion`
now measures the changed pixels' bounding box, and `looksLikeACursor` judges
it against the three properties a cursor has and a repaint does not: it is
small, it is compact, and its top-left corner is **at the hotspot**, because
the hotspot is the arrow's tip. The bounds scale with the crop, so a real
Windows cursor at 200% display scaling still passes.

A change that clears the size bar but is not cursor-shaped is now
**indecisive**, not a pass — "I cannot tell" and "there was no pointer" are
different claims and only one of them should fail a run.

**Re-measured on real recordings**, not asserted. Every one of the six web
probes now reports a changed region of **18–20 × 27–31 px anchored within
2 px of the hotspot** — the arrow, and nothing else. The control still
reads 0.00000 at every probe. Five falsifiers cover the rule, including a
tooltip-shaped region and a cursor-sized region in the wrong place.

### F3 — findings 4 and 7: the ramp treated every unmarked gap as waiting

**Right, and material for exactly the genre this session is building for.**
The framework's record is authoritative and *sparse*: an orchestrator
session writes a timestamp every few minutes, so a person reading the
screen, typing a prompt or scrolling a diff produces no ledger entry and
looks identical to a suite running. The plan said so in words and did
nothing about it, which is not a mitigation.

**Fix: ask the recording too.** `collect_screen_marks` samples the video
every four seconds at 64×36 greyscale and emits a mark wherever consecutive
samples differ by more than encoder shimmer. Screen marks merge with record
marks, and because marks are never compressed, **the two sources can only
ever add real-time segments — neither can remove one.**

Measured on a real recording: compression of the same 44-second video fell
from **72% to 51%**, and the stretch from 20s to 29s — which the record
alone would have sped up — is now protected and labelled *"the screen moved
here, though the framework's record says nothing — this is someone
working."* Segments now name which source vouched for them.

A plan built without sampling the recording says so in the rendered output.
Eight further falsifiers, including the one that matters most: a still
screen must produce **no** marks, or the fix would simply refuse to compress
anything and look like it worked.

### F4 — the supplementary finding: the synthetic pointer hid behind a native modal

**Right.** A native `<dialog>` opened with `showModal()`, and any open
popover, render in the browser's **top layer**, which is above every
ordinary stacking context regardless of z-index. The pointer was an ordinary
child of `<body>`, so it vanished exactly where a viewer most needs it.

**Fix:** the pointer is promoted into the top layer with
`popover="manual"` + `showPopover()`, guarded, with the existing z-index
still doing the work on engines that lack the API.

**Proved in pixels** (`s7-pointer-top-layer.json`), against a full-bleed
modal, with the fix removed as the control: **9.0% of the crop is
non-modal colour with the promotion and exactly 0 without it.** The first
run of that measurement scored 34% in *both* states — the modal's own button
sat under the hotspot and the instrument was measuring a button. Moving the
button out of the crop is what made it a measurement.

---

## Not fixed, and why

### F5 — findings 3 and 9: the long-form human-driven capture harness was not built

**The finding is correct.** Step 3 of the spec asks for capture around a
real session in a real VS Code window, and only the time-compression half of
that step was built.

It is not being built now, and the reason is the same one that stopped the
recordings: **there is no capture backend that draws a cursor**, and this
session's own measurement is what established that. A long-form harness
built on WGC would record six tutorials of controls operating themselves,
which the operator's ordering ruling of 2026-08-16 exists to prevent; a
harness built on `gdigrab` would ship a capture backend against which none of
the Session 4 pilot's seven criteria has been run, into a recorder that is
**gated closed** pending an operator ruling. That trade is journaled in
`decisions.jsonl` and put to the operator rather than taken.

**Owed**, with the backend decision as its precondition.

### F6 — findings 5 and 10: the tutorial package is an outline, not a package

**Correct as stated.** `single-module-walkthrough.md` defines the toy
project, the three session sets, what each recording must show and the
runbook; there are no recordings, no ramp plans and no per-video safety
records.

Those artifacts are **outputs of six recording sessions that a human has to
drive** — a tutorial showing AI help author a plan cannot be scripted,
because the AI's output differs every run, which is precisely why Set 108's
walk could not prove this half of the lifecycle. They are blocked on the
same backend decision as F5 and on operator time.

What is *not* blocked was done: the written walkthrough stands alone with no
video, which is spec decision 4 and the reason authoring it now is not
premature.

---

## What this remediation did not touch

The web pointer, the speed-ramp `apply` path and the publication safety
checklist were not findings and were not changed, except where F2 and F3
reached them.
