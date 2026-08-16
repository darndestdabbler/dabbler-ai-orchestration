# Set 113 Session 4 — the OS-capture verdict

> **The measurement is the deliverable.** This session was budgeted to end
> in a number either way, and a documented failure was always a successful
> session. What follows is that number, what it does and does not license,
> and what is owed.
>
> Criteria: [`s4-pilot-criteria.md`](s4-pilot-criteria.md) /
> [`s4-pilot-criteria.json`](s4-pilot-criteria.json), committed **before the
> first capture** and read by the harness, which refuses to run without them
> and stamps their SHA-256 into every measurement it writes.
> Raw numbers: [`s4-os-capture-measurement.json`](s4-os-capture-measurement.json).
> Reproduce: `npm run pilot:os-capture` from `tools/dabbler-ai-orchestration`.

## The verdict

**Machine verdict: FAIL.** Ten clean captures out of ten required; five of
seven criteria met; **C2 and C7 unmet**, both analysed below.

**The spec's own bar was met.** *Ten consecutive clean captures from a
fresh fixture, with no wrong-window capture and no privacy leakage* — that
is exactly what the numbers show. The FAIL comes from two additional
clauses this session set for itself, one of which is unsatisfiable through
OBS at all and one of which is a mis-calibrated control on a claim that
otherwise passes absolutely. Both statements are true; the record keeps
both rather than picking the flattering one.

| | criterion | verdict | measured | bar |
| :--- | :--- | :--- | :--- | :--- |
| C1 | window selection is repeatable | **PASS** | 0.9996 on every capture; decoy 0.2987 | >= 0.90; decoy <= 0.70 |
| C2 | no unrelated desktop pixels | **FAIL** | leakage **0.000000**; detector control 0.441 | <= 0.0005; control >= 0.50 |
| C3 | usable resolution under scaling | **PASS** | 0 px delta; 1440x900 -> 1024x700 followed | <= 2 px |
| C4 | step events align with captions | **PASS** | anchor 106-110 ms; every cue inside the recording | <= 1500 ms |
| C5 | absent dependency fails clearly | **PASS** | 3 of 3 variants named, walkthrough completed, 0 video artifacts | all three |
| C6 | deterministic cleanup | **PASS** | 14 attempts, 0 problems, incl. 3 part-way failures | zero leftovers |
| C7 | no monitor capture, no camera, no audio | **FAIL** | only `window_capture` ever created; 1 source per scene; **1 audio track** | 0 audio tracks |

Two rounds were run. **Round 1 found C4 failing** — the last caption cue
ended 32-83 ms after the recording did, on all eleven of its captures — and
round 2 re-measured the whole pilot against the fixed recorder rather than
patching a number. Round 1's numbers are otherwise identical to round 2's.

**Cleanup was confirmed independently**, not only by the harness reporting
on itself: after the pilot, OBS is not running, `server_enabled` is back to
`false` with the operator's own password untouched, the only scene
collection and profile are their own `Untitled`, and no `.sentinel` run
markers remain.

**The occluder was genuinely occluding.** It covered **80.8%** of the
target window and held foreground focus at the moment of capture, and the
capture was byte-for-byte indistinguishable from the unoccluded frame
(correlation 1.000 in all ten). Without that geometry, "no magenta in
frame" would have been equally consistent with an occluder that opened
somewhere else.


## What the pilot actually establishes

**Windows Graphics Capture through OBS records this repository's own VS
Code product cleanly, repeatably, and without capturing anything it was not
pointed at.** That is the question the session existed to answer, and the
answer is yes on the evidence below.

It does **not** establish that OS capture is a solved problem in general.
Three limits are worth stating before the table, because each is a way a
reader could over-read this:

1. **One display scale was exercised.** This machine runs at 100%. Changing
   the operator's live display scaling to test 125% or 150% would disrupt
   the desktop they work on, and was not done. The window-resize variant
   tests the same *dimension-blindness* failure mode without touching
   display settings, and it passes — but a pass here is a claim about
   100% scaling and no other.
2. **C1 measures OBS's capture source, not the encoded file.** The
   correlation compares OBS's own frame of its source against a Playwright
   screenshot of the same window. A capture that was perfect at the source
   and black in the file would pass it. The file is corroborated only
   indirectly — tens of megabytes per 49-second clip, where a static black
   clip would be a few hundred kilobytes — and directly only by a human
   watching it, which is item 1 of the guided look.
3. **One machine, one OBS version, one GPU.** OBS 32.2.1, obs-websocket
   5.7.4, Windows 11.

## The criteria that did not come out first time

They are not the same kind of finding and should not be read as a count.
Two were real defects and are now fixed and passing (C4, and C6 after
verification caught it passing on the wrong evidence); one is a
mis-calibrated control on a claim that passes absolutely; one cannot be
satisfied at all.

### C6 — passed on the wrong evidence, now passed on the right evidence

C6 asks for cleanup **including when the run fails part way**, proved by an
induced mid-run failure. The first cut passed it on the three
dependency-absent variants and asserted in its own note that those *"ARE
the part-way failures C6 asks for"*. They are not: all three die during
setup, and two of them before a scene collection or profile exists at all,
so they exercise a cleanup with nothing to undo. Verification caught the
claim.

There are now three induced failures, one at each point a capture can fail
— `configure`, `start`, `stop` — each throwing a **plain** Error, because
that is the type the broken paths threw. Each must both clean up completely
and leave the walkthrough intact. All three do: walkthrough completed,
manifest written, zero video artifacts, no OBS process, no leftover
collection, profile or run marker, config restored.

### C4 — a real defect, found by the criteria and fixed (now PASS)

The last caption cue ended **32–83 ms after the recording did**, on every
one of the first eleven captures. The cue window is derived from the
`run-finished` event; `StopRecord` lands a few frames before that event's
timestamp. Nobody would ever see it, but a caption sidecar that runs past
its own video is wrong in the direction that makes a player clamp or drop
the final cue.

**This is the criteria doing their job.** Nothing else in the session would
have caught it — the videos look fine, the captions look fine, and the two
were only ever compared because C4 said to compare them.

Fixed by holding the recording open 750 ms after the last step, which also
replaces a hard cut on the frame of the final click with a beat of
stillness the viewer can read the result in.

**Re-measured, not asserted.** The whole pilot was run a second time
against the fixed recorder — ten captures, the resize variant and all three
dependency-absent variants — rather than patching one number in round 1's
record. C4 passes in round 2 with every cue inside its recording.

### C2 — the claim passes; the control's threshold was mis-set

The substantive claim is **met, absolutely**: across every capture, an
occluding window covering **80.8%** of the target and holding foreground
focus contributed **zero** pixels to the frame.

What failed is the **control** — the check that proves the magenta detector
fires at all. Its bar was "at least 50% magenta when pointed at the
occluder itself", and the occluder measured **44%**. The reason is my own
instrument design: the occluder doubles as C1's decoy, so it carries three
dark bars to give the correlation something structured to fail against, and
the captured window includes Chromium's own browser chrome. Between them
they eat more than half the frame.

**This is not retuned and re-run.** Making the occluder more magenta after
seeing the control miss would convert a fail into a pass by adjusting the
instrument, which is the same sin as moving the threshold — so the number
stands as measured. What the control does establish is a separation of
**0.44 against 0.00**: the detector fires overwhelmingly on the occluder and
not at all on the target. The criterion as written is unmet; the property it
exists to protect is not in doubt.

### C7 — an OBS limitation, not a product choice

Every recording carries an audio track. **No audio source exists**: the
recorder creates its own scene collection, which comes up with zero inputs,
and `GetSpecialInputs` reports every global audio device as null, so the
track can only carry silence. Four configurations were tried — simple
output, `RecTracks=0`, advanced output, advanced with zero tracks — and OBS
muxes a track regardless.

**Reported unmet rather than reworded.** The privacy property the criterion
protects (no microphone, no desktop audio, no camera) is structurally
guaranteed and separately asserted; the clause as I wrote it cannot be
satisfied through OBS configuration, and softening it after the fact would
be exactly the post-hoc criteria-writing the spec forbids.

Whether a provably silent track is acceptable is **not mine to settle** —
it is a question about what the product may ship, and it is item A of the
guided look.

## What ships, and under what condition

**Nothing ships.** The criteria say a fail ships no recorder, and the
verdict is FAIL.

The first version of this section called the recorder *provisional* and
left `npm run walkthrough:vscode` registered and documented. Verification
rejected that in both discovery lenses, correctly: *"calling it provisional
in prose does not enforce a gate"*, and a user cannot distinguish "present
pending approval" from shipped functionality. So:

- **The npm entry is gone.** The recorder is reachable only as
  `node scripts/record-vscode-walkthrough.js`.
- **The documentation says it is not approved for use**, at the top of its
  own section, with a link here.
- **The recorder announces its own status on every run**, read from the
  pilot's committed evaluation rather than from a sentence that would go
  stale. When the verdict becomes `PASS` — or the operator records a waiver
  and the evaluation is recomputed — the notice stops printing by itself.

The code itself remains in the tree because **the measurement cannot exist
without it**: the pilot harness drives the recorder, and deleting the
recorder would delete the evidence this session was budgeted to produce.
What was removed is every surface that presented it as available.

This session does **not** self-authorize a waiver. Adjudicating a criterion
as non-blocking reduces verification, which is inside the decision-rights
hard carve-out, so whether a provably silent audio track is acceptable is
item A of the guided look.

## The ffmpeg fallback — OPEN, and it needs the operator

**This is the one thing this session could not settle, and it is recorded
as open rather than argued closed.**

The spec names ffmpeg `gdigrab` as the fallback capture candidate.
Verification raised its absence twice: once in discovery, and again in the
remediation review, where the first attempt to close it by *recording* it
rather than *doing* it was **fix-rejected**. That rejection lands one blow
squarely, and it is worth repeating rather than softening:

> *"The claim that OBS 'did not fail at capture' improperly narrows the
> trigger: C7 is part of the authoritative capture criteria, OBS's verdict
> is FAIL, and the outcome itself acknowledges that ffmpeg `-an` could
> satisfy C7."*

That is correct. C7 is a capture criterion; the verdict is FAIL; and the
fallback is the one thing most likely to satisfy the clause OBS cannot.

### What was measured, rather than assumed

The first version of this section said "ffmpeg is not installed". That was
true but lazy, so it was checked properly:

| Candidate | Result |
| :--- | :--- |
| `ffmpeg` on `PATH` | absent |
| Playwright's bundled `ffmpeg-win64.exe` (present, v7.0.1) | built `--disable-everything`; `-devices` lists **none**, so **no `gdigrab`** |
| winget / Chocolatey / Scoop shims, `C:fmpeg`, Program Files | absent |
| `winget` and `choco` themselves | **available** — an install is one command |

So the fallback is not merely unmeasured, it is **unreachable without
installing third-party software on the operator's machine**.

### Why this session stopped instead of proceeding

Two reasons, and the second is the one the spec cares about.

1. **Installing software on the operator's machine is their decision.**
   This session was careful to restore every byte it touched outside the
   repository; downloading and installing a media toolchain unprompted
   would be the one place it did the opposite.
2. **Measuring the fallback honestly means building a second capture
   backend** — process management, window targeting, output handling, and
   its own pass through all seven criteria. The spec's Session 4 budget
   says: *"Do not expand ... If the session starts growing, it has failed
   its own budget — stop and record that."* There is a real tension between
   that sentence and the sentence naming the fallback, and resolving a
   spec-versus-spec tension about scope is not this session's call.

The remediation review's own acceptance criterion offers exactly two
routes: run the fallback against the unchanged criteria, **or** record an
explicit operator ruling that ffmpeg's absence terminates fallback
evaluation. This session can produce neither on its own authority — and
manufacturing the second would be inventing an operator ruling, which is
the worst available option.

**So it is escalated, with the decision journaled and the options stated.**
Residual **S4-R7**, owner: operator.

## Residuals

| id | severity | what is owed | owner |
| :--- | :--- | :--- | :--- |
| S4-R1 | minor | C7's no-audio-track clause is unsatisfiable through OBS configuration. The track is provably silent. Needs an operator ruling (guided-look item A) on whether that is acceptable, or the recorder does not ship. | operator |
| S4-R2 | minor | C2's detector control measured 0.441 against a 0.50 bar because the occluder doubles as C1's structured decoy and includes browser chrome. Deliberately **not** retuned. A future pilot should use two windows — a plain fill for the leakage control, a structured one for the decoy. | a future pilot, if one runs |
| S4-R3 | minor | No display scale other than 100% was exercised, by choice: changing the operator's live scaling would disrupt their desktop. The resize variant covers the same failure mode indirectly. | unowned; re-measure if a scaled machine is available |
| S4-R4 | minor | C1 measures OBS's capture source, not the encoded file. A source-perfect, file-black capture would pass. Corroborated by file size and by the human watching it. | closed by guided-look item 1 |
| S4-R5 | minor | A ten-run pilot leaves roughly 430 MB of gitignored video under `.walkthrough-runs/`, and this session ran it twice. Harmless, and worth knowing before running it on a small disk. | none |
| S4-R6 | minor | Cleanup ownership on the rethrow path was fixed after the round-2 captures, so that a non-dependency failure from `configure()` cannot leave OBS running and the config rewritten. It is now **covered by measurement** — the induced-failure variants exercise exactly that path — but it was not covered by the ten. The sibling class was checked in the browser recorder (G-008) and is absent there. | closed by the induced-failure variants |
| S4-R7 | **major, OPEN** | The spec's **ffmpeg `gdigrab` fallback is unmeasured and unreachable** without installing third-party software: no system ffmpeg exists, and Playwright's bundled build has no devices at all. Verification rejected closing this by recording it. Needs an operator ruling — install and measure, or rule the evaluation terminated. This is the session's one unresolved blocking finding. | **operator** |

## Follow-on sets

Reserved, with triggers, in
[`docs/proposals/2026-08-15-set-113-follow-on-reservations.md`](../../proposals/2026-08-15-set-113-follow-on-reservations.md).
Of the four, exactly one has a satisfied trigger today: **Independent
Black-Box UI Critique**. The other three wait on a real terminal target, a
non-org audience, and an actual non-web product supplying requirements.
