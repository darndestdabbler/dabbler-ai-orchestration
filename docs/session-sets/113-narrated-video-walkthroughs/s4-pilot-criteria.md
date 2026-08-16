# Set 113 Session 4 — OS-capture pilot pass criteria

> **Fixed before the first capture.** Criteria decided after the first
> capture are not criteria (spec, Session 4 step 2). The machine-readable
> copy is [`s4-pilot-criteria.json`](s4-pilot-criteria.json); the harness
> **reads** that file and refuses to run without it, and it records the
> file's SHA-256 in every measurement it writes. That is what makes the
> ordering checkable by someone who was not here.

## What is being measured

Whether this repository can record a narrated walkthrough of **its own
product** — the AI Work Explorer, an Electron/VS Code surface that
Playwright's `recordVideo` was measured to break (Set 111 S4) — using
OBS Studio's Windows Graphics Capture through the bundled obs-websocket.

**The measurement is the deliverable.** A fail that is documented is a
successful session; only a pass ships a recorder.

## The bar

**Ten consecutive clean captures from a fresh fixture**, with **no
wrong-window capture** and **no privacy leakage**. Every run stages a new
throwaway fixture workspace. C1–C4 must hold on every one of the ten;
C5–C7 are whole-pilot properties proved by their own induced runs.

## The criteria

### C1 — Window selection is repeatable

Every run captures the intended window, chosen with no human in the loop.

**Instrument.** At a fixed point in each run the harness takes two
pictures of the same window at the same moment: OBS's own frame of its
capture source, and a Playwright screenshot of the Electron page. Both
reduce to 32×32 grayscale and must correlate at **≥ 0.90**.

**Control.** The same comparison against a *decoy* window must come in
**below 0.70**. Without it, a correlation number is unfalsifiable — a
broken instrument that returns 1.0 for everything looks like a pass.

**Ambiguity is refused, not resolved.** Selecting by window title passes
in a sterile environment and captures the wrong window in a real one
(named as the leading false-pass mode by the Step 3.5 routed analysis).
The harness enumerates every candidate match and **refuses to record when
more than one matches**.

### C2 — No unrelated desktop pixels

A window overlapping the target contributes nothing to the frame.

**Instrument.** The harness raises its own occluder window, filled with
pure magenta, over the target and captures. Pixels within L∞ distance 24
of magenta must be **≤ 0.05%** of the frame.

**Control.** Pointing the same detector at the occluder itself must find
**≥ 50%** magenta. This proves the detector fires at all.

**No screen is ever captured.** The leakage control deliberately captures
the *occluder window*, not the monitor — see C7.

### C3 — Usable resolution under display scaling

The capture is at the window's physical pixel size, not a downscaled
logical one. Frame dimensions must match the target's physical client
rectangle within **2 px**.

**Stated limitation, not an omission.** This machine runs at **100%
scaling**. Changing the operator's live display scaling to exercise 125%
or 150% would disrupt the desktop they are working on, and is not done.
Instead one extra run **resizes the target window** and asserts the frame
dimensions follow — the same dimension-blindness failure mode, reachable
without touching display settings. That no scaled display was exercised
is recorded as a residual.

### C4 — Step events align with captions

Cues retimed from the step-event stream land inside the recording.
`anchor.uncertaintyMillis` ≤ **1500**, one cue per scenario step, and
every cue window inside the duration OBS itself reports.

OBS start-of-recording latency is real and larger than the browser case,
so the harness brackets the start call and carries the bracket width as
the anchor's honest uncertainty rather than implying frame accuracy —
the same contract Session 3 established.

### C5 — Absent dependency fails clearly

Three induced variants, each run for real: **websocket unreachable**,
**websocket auth rejected**, **OBS executable absent**. Each must name
OBS in its failure, and the walkthrough must still finish and write a
manifest carrying **zero** `os-video` artifacts. A dependency check that
only looks for `obs64.exe` on disk is the shallow version of this and
does not satisfy it — the live endpoint is what is checked.

### C6 — Deterministic cleanup

Nothing the harness created outlives the run, **including when the run
fails part way** — proved by an induced mid-run failure, not only by the
happy path. The OBS process the harness launched is gone; the scene
collection and profile it created are removed; the VS Code process is
gone; no zero-byte or temporary leftovers remain.

### C7 — No monitor capture, ever

The pilot never captures the screen. `monitor_capture`, `display_capture`
and `game_capture` are forbidden input kinds, and every captured window
must belong to a process the harness itself launched. This is why the C2
control captures the occluder window rather than the desktop.

## Cleanliness of the operator's own OBS

The harness creates its **own** OBS profile and scene collection through
the websocket API and removes them afterwards. It does not modify the
operator's existing configuration, and OBS remains a documented optional
prerequisite — never bundled.

## What counts as a fail

Any criterion unmet, or fewer than ten consecutive clean runs. A fail
ships **no** recorder, keeps manual-only degradation intact, and leaves
the measurements as the durable deliverable.
