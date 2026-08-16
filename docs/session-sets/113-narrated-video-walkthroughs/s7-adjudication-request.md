# Session 7 — adjudication request

**The verification loop is at its enforced bound** (2 discovery passes, 2
remediation-review cycles) with **five Major findings unfixed**. Another
round is refused by the tool, and passing the bound requires the operator's
own `--operator-authorized-round` attestation — never the orchestrator's.

Two fix verdicts were accepted in the final cycle. The five below are what
remain, and they are **three questions**, not five: two of them are real
limits of instruments I built, and three are one blocked deliverable seen
from three angles.

Nothing here is disputed. I am not asking you to overrule a verifier that
is wrong; on all five it is reading the code correctly. I am asking for a
decision about **scope and a capture backend**, which is yours.

---

## Question 1 — the capture backend (findings 1, 3 and 5)

**These three are one thing.** There is no capture backend that draws a
cursor, and this session's own measurement is what established it
([`s7-cursor-capture-backends.json`](s7-cursor-capture-backends.json)):

| backend | workbench in frame | cursor in frame |
|---|---|---|
| OBS window capture, WGC — what ships today | yes (0.9996) | **no** (0.00000) |
| OBS window capture, BitBlt | **no** (black frame) | — |
| ffmpeg `gdigrab` over the window's desktop rectangle | yes (0.9697) | **yes** (0.124) |

So: the VS Code recorder will make pointer-enabled recordings with no
pointer in them (finding 1); no long-form harness was built on top of a
backend that cannot do the job (finding 3); and the six tutorial recordings
do not exist (finding 5).

**Note on Session 4's gdigrab probe, because it looks like a contradiction
and is not.** That probe measured `gdigrab title=<window>` and found a black
frame — the same failure as OBS BitBlt, and the same cause. This session
measured `gdigrab -i desktop` over the rectangle the window occupies, which
reads the composited desktop. Different mode, different result.

**Options.**

- **(a) Authorise a `gdigrab` desktop-rectangle backend, gated behind a
  measurement pass against the Session 4 criteria.** This is the route that
  ends with tutorials that show a cursor. It is not free: a desktop
  rectangle takes anything that comes to the front into the frame — which
  is criterion C2, "no unrelated desktop pixels" — and it does not follow a
  window that moves. Both matter more than usual here, because these videos
  are destined for a public URL. Cost: roughly a session.
- **(b) Record the tutorials without a visible cursor.** Cheapest, and it
  contradicts your own ordering ruling of 2026-08-16, which exists exactly
  to stop a tutorial being recorded twice.
- **(c) Defer the tutorials to a follow-on set** and let Session 8 close
  this one on what is proved: the portable path, the ramp, the checklist and
  the tutorial plan.

**My recommendation: (a), as Session 8's first work or a follow-on set,
with (c) as the fallback if Session 8 should stay set-terminal.** Confidence
moderate. The measurement makes the route clear; what I cannot judge for you
is whether the tutorials are worth another session right now, against a seat
you have described as capacity-constrained.

**Default if you say nothing:** the tutorials stay unrecorded and Session 8
closes the set on what is proved. Nothing is lost — the written walkthrough
stands alone, which is spec decision 4.

---

## Question 2 — how strong the pointer check has to be (finding 2)

The check measures the **bounding box profile** of what changed: small,
compact, taller than wide, tip at the hotspot. The verifier's point is
correct — that is a profile, not the cursor's pixels, and something else
with an arrow's proportions at exactly the click point would pass.

**What it currently rules out**, measured rather than argued: the control
recording (0.00000 at all six probes), a full-width repaint, a hover tooltip
(the case that actually occurred, 6.5%), and a compact hover state on a
control. Every real probe reports 18–20 × 27–31 px within 2 px of the
hotspot.

- **(a) Accept it as an adjudicated residual.** The instrument has to work
  for both a cursor this repo draws and a real Windows arrow in the
  operator's own theme and size, which is what ruled out matching pixels in
  the first place.
- **(b) Strengthen it to a template match** against a rendering of the
  glyph. Real work, and it only closes the web half — the VS Code half faces
  a cursor whose appearance the recorder does not control.

**My recommendation: (a).** Confidence moderate-to-high. This is a
measurement instrument, not a shipped gate; its job is to make a claim
falsifiable, and it does — the control fails it decisively.

---

## Question 3 — the wait the ramp cannot see (finding 4)

A person reading a **static** screen for more than forty-five seconds
writes no timestamp and moves no pixels, so the ramp still calls it waiting.
The threshold is a margin, not a fix, and the verifier is right that it is a
judgement call rather than a derivation.

Fixing it properly needs **input events** — keystrokes and real mouse
movement — which nothing in this repo captures, and adding an input
recorder to a machine whose recordings go to a public URL is a bigger
decision than this finding.

- **(a) Accept as an adjudicated residual.** The plan is a reviewable file
  and prints the fraction it is compressing, precisely so a human can
  disagree before an hour of video is re-encoded.
- **(b) Raise the threshold further**, e.g. to two minutes. Safer, and it
  stops compressing the medium-length waits that make a long session
  watchable.

**My recommendation: (a).** Confidence high. The opposite error is safe by
construction — an animated wait registers as movement and stays at real
speed — so the failure mode is bounded and visible in a file you read
first.

---

## Where the set stands

Session 7 delivered, proved in artifacts rather than in tests:

- the **web pointer**, 6 of 6 probes with a cursor-shaped mark at every
  target, against a control that scores 0.00000 at all six;
- the pointer **over a native modal**, 9.0% against 0 without the fix;
- the **physical pointer** on the VS Code path, calibrated by measurement
  with a 0 px residual, opt-in, announced, restored on every exit path;
- **why the VS Code recording still shows no cursor**, measured across
  three backends — which overturns the standing diagnosis that capture was
  never the problem;
- the **event-derived speed ramp**, with a second evidence source read from
  the recording itself, proved end to end (predicted 22.46s, produced
  22.52s);
- the **publication safety checklist** and the **single-module tutorial's**
  toy project, session-set plan and runbook.

Not delivered: the long-form capture harness and the six tutorial
recordings, both blocked on Question 1.

---

# Operator adjudication — 2026-08-16

> *"I will take all your recommendations."*

All three recommendations accepted. Journaled in `decisions.jsonl` under
`authority: human` with that attestation.

**An adjudication settles the STOP, not the truth.** None of the five
findings is closed by this. Each becomes an owed residual with a named
owner:

| # | finding | disposition | owner |
|---|---|---|---|
| 1 | VS Code recordings will not show a pointer | residual — route authorised | the reserved backend set |
| 3 | no long-form human-driven capture harness | residual — blocked on the backend | the reserved backend set |
| 5 | no tutorial recordings | residual — blocked on the backend | the reserved backend set |
| 2 | the pointer check matches a profile, not cursor pixels | **accepted residual** | none; stated, not owed |
| 4 | a static read longer than 45s is still compressible | **accepted residual** | none; stated, not owed |

**Placement, which the operator left to me and which I am recording so it
can be overturned at Step 9.** The backend work is a **reserved follow-on
set**, not Session 8's first step. Session 8 is set-terminal and already
carries `change-log.md`, the Step 9 review and the UAT record for all seven
declared components; the Session 4 pilot that wrote the seven criteria was
itself a whole session; and a terminal session that grows a new engineering
deliverable stops being terminal.

**The consequence, said plainly rather than left to be discovered:**
**Session 8's multi-module tutorial recordings are blocked by exactly what
blocked Session 7's.** Session 8 authors its tutorial and completes the
set's accounting; both tutorials' recordings are owed to the reserved set.
That is option (c) reached deliberately.

---

# Superseded the same day — read this before the section above

**The operator overturned the placement**, and the sections above are kept
as the record of what was asked and answered rather than as current
instructions. Option (c) would have ended a set about narrated video with
**no video in it**, which is not what the two-tutorial direction was for.

The set was **extended to nine sessions**. **Session 8** is now *A capture
backend that draws the cursor* — the `gdigrab` measurement against the
Session 4 criteria, plus the long-form harness Session 7 owed. **Session 9**
is the old Session 8: both tutorials' recordings and the set's accounting,
still set-terminal. Wherever the text above says "Session 8" as the terminal
session or as the one that authors and records nothing, read **Session 9**.

Both run on the operator's **work computer**, on a Copilot seat — the
personal machine's API credits are nearly exhausted. See Session 8's
prerequisites block in `spec.md`.
