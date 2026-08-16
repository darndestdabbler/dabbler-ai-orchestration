# Set 113 Session 5 — isolation pass criteria

> **Fixed before the first container run**, and machine-readable in
> [`s5-isolation-criteria.json`](s5-isolation-criteria.json). The harness
> refuses to run without that file and stamps its SHA-256 into every
> measurement it writes, so a result can always be tied to the criteria it
> was judged against. Criteria decided after the first run are not criteria.
>
> This is Session 4's discipline, reused deliberately, and the reuse goes
> further than the process: where a claim did not change, its **instrument
> and its threshold are inherited exactly**. A change in result then cannot
> be a change in yardstick.

## What this session is actually testing

Not "can a container record something". The question the operator set is
narrower and sharper, and it comes from their own reframing of 2026-08-16:

> *"Giving AI the ability to capture your desktop is more than a bit of a
> security risk."*

Session 4 **governed** that risk — window capture only, never a monitor, a
scene asserted to hold exactly one source, camera and audio input kinds
forbidden. Every one of those is the harness behaving well. A container
**removes** the risk instead of governing it, and the criterion that tests
whether it really does is **I1**. Everything else here exists to stop I1
passing for the wrong reason.

## The criteria

| | criterion | bar |
| :--- | :--- | :--- |
| **I1** | host is invisible | magenta marker held foreground on the host contributes ≤ 0.0005 of any frame; detector control ≥ 0.50; and the run command carries none of the listed escape hatches |
| **I2** | target is actually visible | correlation ≥ 0.90 against an in-container screenshot; decoy ≤ 0.70; frame standard deviation ≥ 8.0 |
| **I3** | usable resolution | frame dimensions within 2 px of the virtual display geometry |
| **I4** | no camera, no audio, no host display | no `/dev/video*`, no `/dev/snd`, no host X11 socket, no audio track in the file |
| **I5** | dependency absent fails clearly | three induced variants, each named, walkthrough still completes, zero video artifacts |
| **I6** | deterministic cleanup | container gone, no dangling volumes, no leftovers, host Podman machine left in its entry state |
| **I7** | cost is recorded | image size, build time, cold start, capture wall clock — **present**, not under any threshold |

**Bar: three consecutive clean runs from a fresh container**, all of I1–I4
per run, zero host-pixel captures, zero black-frame captures.

### Why three runs and not Session 4's ten

Because the reduction has to be argued, not assumed. Session 4's ten bought
down a **repeatability** risk that was specific to the host: eleven
candidate windows existed, two of them `Code.exe`, and a driver that matched
the wrong one would do so intermittently. Ten consecutive clean captures is
the right instrument for an intermittent selection fault.

A container has one display and one application on it. That failure mode is
absent **by construction**, not by luck. What this session must establish is
a **property** — that host pixels cannot reach the capture — and a property
is established by the control in I1 and by the structural assertions on the
run command, not by repetition. Three runs guard against a one-off fluke in
the surrounding machinery. They are not claimed to do more, and the outcome
record must not read as though ten runs had happened.

### The two controls, and why the session is worth nothing without them

- **I1's positive control.** "No magenta found" is equally consistent with a
  detector that cannot find magenta at all. Session 4 learned this
  expensively: its C2 was scored **FAIL** on a miscalibrated control while
  the leakage measurement itself was a clean `0.000000`. The detector must
  be shown firing before its silence means anything.
- **I2's black-frame guard.** This is the failure mode a container is *more*
  likely to hit than the host, because software rendering on a virtual
  display can produce a recording whose frames are empty while every
  surrounding assertion still passes. Two black images correlate perfectly,
  so correlation alone cannot catch it; the standard-deviation floor can.

## What a container cannot be asked to meet

Stated here so that their absence from the results table is a **documented
decision** rather than a gap someone finds later.

1. **Windows fidelity.** Podman on Windows is a Linux VM, so this records
   **Linux VS Code**. The operator accepted that cost on 2026-08-16. No
   criterion may be written that a Linux recording passes by pretending to
   be a Windows one, and the fidelity trade is Step 6's job to name.
2. **Display scaling.** Session 4's C3 carried a scaling caveat because
   Windows display scaling really does produce downscaled captures. A
   virtual display has one fixed geometry and no DPI story. I3 keeps the
   dimension check and **drops the scaling claim entirely** — a pass here
   says nothing about display scaling and must never be cited as if it did.
3. **Window selection among competitors.** C1 refused to record when more
   than one window matched. There is nothing to disambiguate on a display
   holding one application, so I2 inherits C1's *instrument* to prove the
   capture is not black — the live risk — and abandons its *claim*.
4. **Caption alignment.** C4 proved that captions retimed from the
   step-event stream land inside the recording. That is a property of
   `walkthrough_run finalize`, which this session does not modify.
   **Inherited, not re-measured**, because re-measuring it would re-prove
   someone else's code.

## What counts as a fail

Any of **I1 through I6** unmet, or fewer than three consecutive clean runs.
A fail ships **no container capture path**: the measurements are the
deliverable, manual-only degradation stays intact, and Session 4's host path
— already gated closed on its own FAIL — is not disturbed either way.

**I1 unmet is worse than a fail.** It would mean the container does not
deliver the one thing it exists for, and the outcome record must say so in
those words rather than folding it into a criteria table.

## What is measured before any of this

The spec orders the **plugin-surface comparison first**, and it is not
governed by these criteria because it is a comparison rather than a test:
OBS's `--only-bundled-plugins` flag, measured with and without, on the
operator's real install. If the cheap mitigation removes most of the
supply-chain surface, the container has to justify itself on the
**capability** argument alone — and per the operator's 2026-08-16 note, that
is the argument that actually matters. Either way the number is worth having
before the expensive step runs.
