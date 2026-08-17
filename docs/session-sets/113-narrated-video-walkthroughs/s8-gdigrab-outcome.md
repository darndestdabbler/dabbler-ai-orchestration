# Session 8 — a capture backend that draws the cursor

**Verdict: `FAIL`, on one criterion, and that criterion is a question rather
than a defect.** `ffmpeg gdigrab` over the target window's desktop rectangle
met **six of the Session 4 pilot's seven criteria at the full bar** — ten
consecutive clean runs, eleven measured, one excluded as control-contaminated
— and the pointer-visibility artifact the whole set was waiting on has
**flipped from `FAIL` to `PASS`**.

The one unmet criterion is **C7**, and only one of its three clauses. It
cannot be met by any backend that draws a cursor, for a structural reason
this session can state but must not decide. That is step 5's question and it
is the operator's.

Artifacts: [`s8-gdigrab-capture-measurement.json`](s8-gdigrab-capture-measurement.json),
[`s8-pointer-visibility-vscode.json`](s8-pointer-visibility-vscode.json).
Criteria read off disk and hashed:
`s4-pilot-criteria.json`, `sha256:3ed9f678…6b7d0ecf` — the **same file**
Session 4 was judged against, unmodified.

---

## What was measured

| criterion | verdict | the number that decided it |
|---|---|---|
| C1 window-selection-repeatable | **MET** | correlation **0.9989** across 10 runs (bar 0.9); decoy **−0.0159** (bar ≤0.7) |
| C2 no-unrelated-desktop-pixels | **MET, via the mitigation** | see below — this is the interesting one |
| C3 usable-resolution-under-display-scaling | **MET** | dimension delta **0 px** on every run, and **0 px** after a deliberate resize to 1024×700 |
| C4 step-events-align-with-captions | **MET** | worst anchor uncertainty **202 ms** (bar 1500); cues == steps; every cue inside the recording |
| C5 dependency-absent-fails-clearly | **MET** | four named failure kinds, each naming the dependency, each producing **0** video artifacts |
| C6 deterministic-cleanup | **MET** | 15 attempts, **0** leaked ffmpeg processes, **0** stray driver scripts, **0** cleanup problems |
| C7 no-monitor-capture-ever | **NOT MET** | no-audio **met**; one-source **met**; "never captures the screen" **not met, structurally** |

Ten clean runs out of ten required. The eleventh run exists because the
control run's own video is destroyed by its own occluder (below), so it can
never be one of the ten — Session 4 hit the identical problem and excluded
the same way.

---

## C2 is the criterion this backend change is about

OBS's window capture is **immune** to a window overlapping the target.
gdigrab reads the composited desktop and **is not**. That is not a
suspicion; it is measured here at **25.39% of the frame**.

So C2 is scored against the **mitigation** — which the spec put in scope in
its own words: *"a mitigation (refuse to record when another window overlaps
the rectangle; abort on occlusion mid-capture) is in scope."* Four
sub-measurements were required and all four hold:

| sub-measurement | result | why it is required |
|---|---|---|
| the detector fires on real magenta | **0.7053** (bar 0.5) | without it, "no magenta found" proves nothing |
| the weakness is real, guard **off** | **0.2539** leaked (bar 0.0005) | without it, the guard is indistinguishable from a backend that never had the problem |
| the guard **refuses** before starting | `occluded-before-start` | starting dirty and aborting one poll later still writes the frames the guard exists to exclude |
| the guard **aborts** mid-capture | `occluded-mid-capture` at 3252 ms | with a control that held clean for 1500 ms and did **not** abort |

Shipped runs that leaked: **0**.

### The detector control is the instrument Session 4 failed on

Session 4 recorded C2 **unmet for OBS with zero leakage**. The capture was
clean; the *instrument* fell short — its Chromium occluder scored
**0.441219** against a 0.5 detector-control bar, because a browser's title
bar, tab strip and address bar are not magenta and are a fixed cost a
0.6-scale window cannot amortise. This session's occluder is a **borderless
WinForms window**: no chrome to dilute the fill, and it clears the bar at
0.7053. The instrument was fixed; the bar was not moved.

### What is actually being traded

OBS delivers a clean frame while something covers the window. This backend
delivers **no frame**. That is **availability traded for safety**, and it is
a genuinely different property from the one OBS was scored on. On a busy
desktop this backend will refuse to record more often. Accepting that trade
is the operator's, and it is journaled in `decisions.jsonl` as such.

---

## Window-follow: abort on move

The spec offered three policies and asked for one, measured. **Abort on
move** is implemented, with a falsifier and a control:

- moved 120,80 px mid-capture → aborted at **1947 ms**, kind `window-moved`,
  and the footage before the move was **kept** (2100 ms of file);
- held still for 1800 ms → **did not** abort.

The other two were rejected, and the reasons are recorded because they are
not preferences:

- **Re-read per frame is unimplementable.** gdigrab fixes its rectangle when
  the stream opens. Emulating it means one file per move, or capturing the
  whole 5760×1200 virtual desktop and cropping with a per-frame rectangle
  ffmpeg has no way to receive.
- **Pinning the window is refused on the spec's own terms.** Step 3's harness
  "observes and nothing more — it must not … make a session behave
  differently because it is being recorded." A window the operator cannot
  move for fifteen minutes is a session behaving differently.

---

## C7 — the split verdict, and the question it leaves

C7 carries three separable requirements. Collapsing them into one boolean
would hide the finding.

**(a) No audio track — MET, structurally.** `-an` is an argument on the
command line and no audio device exists in the graph. ffprobe reads back
**zero** audio streams on all 11 recordings. **This is the clause OBS could
not satisfy**: it muxes a silent track regardless of configuration, and
Session 4 measured 1 audio track on all 11 of its recordings.

**(b) Exactly one source — MET.** One rectangle, one video stream, no
compositing.

**(c) "Never captures the screen, only windows the harness itself launched"
— NOT MET, and unmeetable.** The criterion expresses this as a list of
forbidden OBS *input kinds*. This backend has no input kinds at all, and its
mechanism **is** a screen read: `gdigrab -i desktop` over a rectangle.

The criterion's **purpose** is met. Its own amendment says why it exists: the
operator's default OBS scene collection carried a live webcam, a microphone
and desktop audio, and the harness must never capture any of them. This
backend opens no camera, no microphone and no audio device at any point, and
never writes a monitor-wide frame to disk. Everything outside the target
window's client area is excluded by **geometry and the occlusion guard**.

The criterion's **mechanism clause** is not met, and **no backend that draws
a cursor can meet it** — the cursor is composited by the desktop, which is
precisely why WGC cannot show one.

> **The unresolved question, stated plainly:** does *"never captures the
> screen"* mean the **mechanism** must not read the screen, or that the
> **artifact** must contain nothing but the target window? Under the first
> reading, no cursor-capable Windows backend can ever pass, and this set
> ends with no video. Under the second, this backend passes, conditional on
> the occlusion guard. **Session 8 does not answer this**, and did not waive
> it.

---

## The pointer artifact flipped

`s8-pointer-visibility-vscode.json`: **PASS**, with the control **FAILED** —
which is the shape that matters, because a pass with a passing control
proves nothing (the failure mode L-112-1 names, and the one Session 7's
first web check actually hit).

| | with pointer | control (`--no-pointer`) |
|---|---|---|
| verdict | **PASSED** | **FAILED** |
| decisive probe | cursor-shaped mark, 20×26 px, **tip anchored at the hotspot**, 4.66% of the crop | — |
| change at every probed target | — | **0.00000** at five of six; 0.00064 at the sixth, off-hotspot |

Session 7's `s7-pointer-visibility-vscode.json` still reads **FAIL** and was
**not edited**. It is the honest record of what the OBS path did, and this
session's PASS is worth nothing without it.

Five of the six probes in the pointer run are recorded `indecisive` rather
than passed — the pointer was already inside the crop, or the UI repainted a
region larger than a cursor. That is the bounding-box profile residual
**S7-R4**, already operator-adjudicated, and it is **not re-litigated here**.

---

## What this session did NOT do

**It did not open the Session 4 gate.** The shipped recorder still defaults
to OBS and still fails closed, because the pilot verdict is still `FAIL` and
no waiver is on file. Promoting a backend is a gate decision, so
`--backend gdigrab` is opt-in and `parseArgs` refuses an unknown value rather
than falling back to the default.

**It did not waive C7.** See step 5.

**It did not re-litigate Session 4's OBS result**, and did not modify
`s4-pilot-criteria.json` or any Session 4 or Session 7 artifact.

---

## Known limitations, recorded rather than discovered later

- **One display scale was exercised (100%).** A pass is a claim about that
  scale only — the same residual Session 4 recorded, for the same reason:
  changing the operator's live display scaling is intrusive and was not done.
  The resize variant tests the same dimension-blindness failure mode without
  touching display settings.
- **The negative virtual-screen origin is UNVERIFIED.** gdigrab measures its
  offsets from the virtual desktop origin, which is negative when a monitor
  sits left of or above the primary. The code subtracts it; this machine
  reports `(0, 0)`, so the subtraction is a no-op here and the branch is
  untested. Getting it wrong yields a plausible video of the wrong pixels,
  so this is written down rather than assumed.
- **The long-form harness's happy path was proved on a 10.9 s smoke
  recording**, not on a full session. Its start/stop/daemon lifecycle,
  ambiguity refusal, guard wiring and `speed_ramp` hand-off all ran; the
  ramp correctly **refused** to compress a window containing no framework
  timestamps ("refusing to compress on no evidence"), which is the right
  behaviour and means the compression path itself is exercised in Session 9.
- **Three shipped VS Code windows were open on the measurement machine**, so
  the long-form harness refused to guess between them. That refusal is
  correct and was a dead end, so `--window-title-contains` was added to
  disambiguate — it narrows candidates *before* the ambiguity check and
  never silently picks.
