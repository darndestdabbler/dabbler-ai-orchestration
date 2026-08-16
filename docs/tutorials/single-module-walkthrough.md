# The single-module walkthrough — one module, three session sets, on video

> **What this is.** The written half of the first narrated tutorial: a
> purpose-built toy project small enough that each recorded session runs in
> minutes, taken through the whole Dabbler lifecycle — including the half
> Set 108's walk could not prove, because an orchestrator cannot drive it:
> **AI helping to author the plan and decompose it into session sets**.
>
> **The document is the deliverable; the video is the enhancement.** That is
> a decision this set made at the start (spec decision 4) and it is why this
> page is written to be followed with no video at all. If you never watch a
> frame, you can still do everything below.
>
> **Recording status: not yet recorded.** See
> [What the recordings are waiting on](#what-the-recordings-are-waiting-on).

---

## Why a toy project, and why this one

Two operator rulings shape it, both binding (2026-08-16):

- **A purpose-built toy project, never a real repository.** Each recorded
  session has to run in *minutes* — a real session set recorded end to end
  is hours of wall clock and real engine spend against a capacity-constrained
  seat — and nothing of the operator's own work may appear on screen in
  something destined for a public URL.
- **No container.** These record the host: the same Windows VS Code the
  audience runs. Session 5 accepts a Linux recording because for *proving
  the extension works* the operating system on screen is incidental. For
  **training material aimed at staff who run Windows**, the operating
  system on screen is part of the content.

### The project: `unit-converter`

A single-module command-line tool that converts between units. It was chosen
against three requirements and nothing else:

| requirement | why this project meets it |
|---|---|
| **Small enough to finish** | Three sets of two sessions each, every session a single file and a handful of tests. |
| **Big enough to decompose** | Length, mass and temperature are genuinely separable, and temperature is genuinely *different* (offsets, not just factors) — so a decomposition has something real to decide rather than three identical slices. |
| **No domain knowledge to explain** | Nobody needs the tutorial to explain what a kilometre is. Every second of screen time is about the workflow. |

**Sizing rule, and it is load-bearing:** if a recorded session runs more than
about **fifteen minutes** of wall clock before compression, the toy project
is too big. **Shrink the project, not the tutorial** — dropping steps is how
a lifecycle demonstration quietly stops demonstrating the lifecycle.

---

## The shape: one module, three sets, six sessions

One module, `unit-converter`. Three session sets, in order, each producing
one recording per session.

### Set 1 — `plan-the-converter` (2 sessions)

**This is the set the whole tutorial exists for.** It is where a viewer sees
something no other Dabbler material shows: a person and an AI arriving at a
plan together, and then cutting that plan into session sets.

- **Session 1 — Author the plan with AI.** Start from a one-paragraph
  intent ("a CLI that converts units, three families to begin with"). Ask
  the orchestrator for a plan. **Disagree with part of it on camera** — the
  first plan will almost certainly put temperature with the other two, and
  the point of the recording is watching that get argued out, not watching a
  plan get accepted. Land on a plan that separates temperature.
- **Session 2 — Decompose it into session sets.** Take the plan and cut it
  into the two sets below, with prerequisites. Show the sizing check: a
  session that would run over fifteen minutes gets split.

**What must be on screen:** the AI's actual output, the human's actual
disagreement, and the plan changing because of it. A recording of a plan
being accepted unchanged teaches that the AI is right, which is not what
this framework claims.

### Set 2 — `length-and-mass` (2 sessions)

- **Session 1 — Length.** Metres, kilometres, miles, feet. Conversion table,
  a `convert()` entry point, tests.
- **Session 2 — Mass.** Grams, kilograms, pounds, ounces. The same shape as
  length, deliberately — so the viewer sees a second session reuse the first
  session's structure, which is what a session *set* is for.

### Set 3 — `temperature` (2 sessions)

- **Session 1 — Temperature.** Celsius, Fahrenheit, Kelvin. The offsets
  break the multiply-by-a-factor shape the first two sets established, which
  is exactly why the plan in Set 1 separated it.
- **Session 2 — One command line over all three.** A single `convert`
  command that dispatches to the right family, plus the failure cases (an
  unknown unit; a conversion between families).

**Prerequisites:** Set 2 requires Set 1 complete. Set 3 requires Set 2
complete. That chain is itself part of what the tutorial shows — the Work
Explorer renders it, and a viewer sees why a blocked set is blocked.

---

## One recording per session

Six recordings, each named for its set and session
(`single-module-set-2-session-1.mp4`). Not one long tour: the operator's
direction is explicit — *"with individual sessions as individual
recordings"* — and it is the right shape. A viewer looking for "how does
decomposition work" should not have to scrub through length conversions to
find it.

Each recording:

- **starts before `start_session` and stops after `close_session`**, so the
  session's own boundaries are the video's boundaries;
- **observes and nothing more.** The recorder must not write
  `session-state.json`, drive the orchestrator, or make a session behave
  differently because it is being recorded. A tutorial that shows a
  specially-behaved session is a tutorial about something nobody else can
  run;
- **is speed-ramped from the framework's own record**, not by hand. See
  below.

### Compressing the waiting

`python -m ai_router.speed_ramp` derives which stretches were *waiting* from
`session-events.jsonl` and `activity-log.json` — the timestamps the session
already wrote — and emits a plan you can read before an hour of video is
re-encoded:

```
python -m ai_router.speed_ramp plan \
    --session-set-dir docs/session-sets/<set> --session <n> \
    --recording-start <ISO-8601 when the recording began> \
    --recording <the file> --out ramp.json

python -m ai_router.speed_ramp apply \
    --plan ramp.json --input <the file> --output <the published file>
```

**Read the plan before applying it.** It prints the percentage of the
recording it is compressing and says so loudly when that is nearly all of
it. The rule the plan keeps is that no interval the record says something
happened in is ever compressed — but the record is *sparse*, and a person
sitting reading the screen looks exactly like a test suite running. That is
the one judgement the plan cannot make for you.

**State the compression on the page that carries the video.** A viewer
watching a suite finish in four seconds is owed the fact that it took forty
minutes.

---

## Before anything is published

Run [the publication safety
checklist](../walkthroughs/publication-safety-checklist.md) **once per
video, with a human watching the video** — not once per batch, and not from
memory of what the recording was supposed to contain. A public video is
unrecallable, and **"do not publish this one" is a valid outcome**.

Nothing in this repository uploads anything. Publication is manual and
stays manual.

---

## What the recordings are waiting on

Two things, and the first is an operator decision:

1. **A capture backend that draws the cursor.** Measured in Session 7
   ([`s7-cursor-capture-backends.json`](../session-sets/113-narrated-video-walkthroughs/s7-cursor-capture-backends.json)):
   OBS window capture on WGC — what the recorder ships with — puts the
   workbench in the frame and **no cursor at all**; OBS BitBlt draws the
   cursor and black-frames the window; only `ffmpeg gdigrab` over the
   desktop rectangle produces both. Swapping backends is a decision the
   Session 4 pilot's seven criteria exist to judge, and none of them has
   been run against `gdigrab`.

   Recording these tutorials before that is settled would produce six videos
   of controls operating themselves — which is exactly what the operator's
   ordering ruling of 2026-08-16 forbids: *"we should get the cursor
   functionality working before recording the purpose-built new
   tutorials."*

2. **A human driving.** These are not scripted scenarios. A tutorial that
   shows *AI helping to author a plan* cannot be scripted, because the AI's
   output differs every run — which is the whole reason Set 108's walk
   could not prove this half of the lifecycle. A person drives; the recorder
   starts, stops and post-processes.

Everything else this tutorial needs is built: the pointer on the portable
path, the speed ramp, the safety checklist, and this plan.
