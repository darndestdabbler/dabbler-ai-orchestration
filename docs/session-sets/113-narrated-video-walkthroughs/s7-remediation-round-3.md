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

---

# Round 3 (remediation-review) — three fixed further, three stopped to the operator

The review rejected all six fix verdicts. Three of its findings are new and
substantive; three are the same two blocked deliverables restated, which is
the correct reading from where the verifier sits and is not something a
further round can change.

## Fixed in this cycle

### R3-6 — the top-layer fix only worked if the pointer was promoted last

**Right, and the measurement that "proved" the original fix had the same
blind spot.** Top-layer entries stack in the order they were added, so a
pointer promoted once at the start of a run sits **below** a dialog opened
part way through it — which is every real walkthrough. `ensureSyntheticPointer`
skipped `showPopover()` when the element was already open, so it never moved
back to the top.

**Fix:** the pointer is now hidden and re-shown on every `ensure`, which
moves it to the top of the stack; the recorders call `ensure` before every
action, so it is always the most recently added entry by the time it matters.

**The measurement was fixed too, and that is the more important half.** It
opened the modal in the page's own markup, *before* the pointer existed —
the one ordering under which the broken code passes. It now creates the
pointer first, opens the modal second, and re-ensures: 9.0% over the modal
against exactly 0 without the promotion.

### R3-2 — a compact hover repaint could still clear the shape rule

**Right.** A checkbox or toolbar icon whose hover state repaints a compact
region at the pointer clears both the size bar and the anchor bar.

**Fix:** a cursor is **taller than it is wide**, and a control's hover state
is not — it follows the control's own shape, and controls are square or
wider. `looksLikeACursor` now requires `height > width * 1.15`. Measured
against this repo's own recordings, the arrow is 18–20 × 27–31, a ratio of
about 1.5; the Windows arrow has the same proportions. Re-run after the
change: 6 of 6 probes still pass with boxes 18×27 to 20×31.

### R3-4 — screen sampling still cannot see a person reading a static screen

**Half right, and the half that is right cannot be fixed by a third
derivation — it needs input events, which nothing here has.** So it is
mitigated by a margin rather than claimed as solved: the quiet threshold is
now **45 seconds**, not 20. Reading is tens of seconds; the waits this
exists to compress are minutes. Anything under the bar plays at real speed
even if it really was a wait, which costs a slightly longer video and cannot
cut through someone thinking.

**The review's other half is safe by construction and is now pinned by a
test.** A wait that shows a spinner or a scrolling log registers as movement
and is kept at real speed — the video gets longer, never less honest.

**Residual, stated rather than closed:** a person reading a static screen
for more than forty-five seconds with no timestamp written is still
compressible. The plan is a reviewable file for exactly this reason, and it
prints the fraction it is compressing.

## Stopped to the operator, not re-rounded

R3-1 (VS Code recordings will not show a pointer), R3-3 (no long-form
harness) and R3-5 (no tutorial recordings) are one blocked thing seen from
three angles: **there is no capture backend that draws a cursor**, and this
session's own measurement is what established it. The route out is a
backend decision that the Session 4 pilot's seven criteria exist to judge,
against a recorder that is gated closed pending an operator ruling. That is
journaled and put to the operator.

Re-rounding cannot move it, and the constitution is explicit that an unfixed
Major goes to the human rather than round again.
