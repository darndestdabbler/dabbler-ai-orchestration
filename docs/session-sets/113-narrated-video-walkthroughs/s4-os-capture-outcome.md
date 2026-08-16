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

<!-- FILLED AFTER ROUND 2 -->

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

## The three unmet criteria, and what kind of thing each one is

They are not the same kind of finding and should not be read as three of
anything.

### C4 — a real defect, found by the criteria and fixed

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
stillness the viewer can read the result in. Re-measured across a full
second round of captures rather than asserted.

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

The recorder is present, documented and usable
(`npm run walkthrough:vscode`). It is **provisional pending the operator's
ruling on guided-look item A**, and this session does not self-authorize
the waiver: adjudicating a criterion as non-blocking reduces verification,
which is inside the decision-rights hard carve-out.

What the spec's own bar asked for — *ten consecutive clean captures from a
fresh fixture, with no wrong-window capture and no privacy leakage* — was
met. What the machine verdict says is FAIL, because this session set itself
three additional clauses and two of them did not come out. Both statements
are true and the record keeps both.

## Residuals

| id | severity | what is owed | owner |
| :--- | :--- | :--- | :--- |
| S4-R1 | minor | C7's no-audio-track clause is unsatisfiable through OBS configuration. The track is provably silent. Needs an operator ruling (guided-look item A) on whether that is acceptable, or the recorder does not ship. | operator |
| S4-R2 | minor | C2's detector control measured 0.44 against a 0.50 bar because the occluder doubles as C1's structured decoy and includes browser chrome. Deliberately **not** retuned. A future pilot should use two windows — a plain fill for the leakage control, a structured one for the decoy. | a future pilot, if one runs |
| S4-R3 | minor | No display scale other than 100% was exercised, by choice: changing the operator's live scaling would disrupt their desktop. The resize variant covers the same failure mode indirectly. | unowned; re-measure if a scaled machine is available |
| S4-R4 | minor | C1 measures OBS's capture source, not the encoded file. A source-perfect, file-black capture would pass. Corroborated by file size and by the human watching it. | closed by guided-look item 1 |
| S4-R5 | minor | A ten-run pilot leaves roughly 430 MB of gitignored video under `.walkthrough-runs/`. Harmless, and worth knowing before running it on a small disk. | none |

## Follow-on sets

Reserved, with triggers, in
[`docs/proposals/2026-08-15-set-113-follow-on-reservations.md`](../../proposals/2026-08-15-set-113-follow-on-reservations.md).
Of the four, exactly one has a satisfied trigger today: **Independent
Black-Box UI Critique**. The other three wait on a real terminal target, a
non-org audience, and an actual non-web product supplying requirements.
