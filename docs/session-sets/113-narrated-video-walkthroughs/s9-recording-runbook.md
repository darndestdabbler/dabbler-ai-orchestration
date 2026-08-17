# Session 9 — the recording run-book

> **Who this is for.** The person at the keyboard, on the work computer, who
> is about to record the six single-module tutorial sessions. It assumes no
> session context: every path, command and expected output is written out.
>
> **What it is not.** It does not re-design the tutorial. The shape, the toy
> project and the content of each recording were decided in
> [`docs/tutorials/single-module-walkthrough.md`](../../tutorials/single-module-walkthrough.md)
> and this file only says how to execute it. Where the two disagree, the
> tutorial wins.

---

## The one ordering rule everything else hangs off

**The recorder starts before `start_session` and stops after
`close_session`.** They are two separate commands run by you, not a wrapper —
deliberately, so that a recording failure can never become a session failure.

```
record-long-form start   ->   start_session   ->   ... the session ...   ->   close_session   ->   record-long-form stop
```

The recorder **observes and nothing more**. It will not raise, focus, resize
or pin the window, and it never touches `session-state.json`. That is the
contract, and it is why the next rule exists.

**Leave the window alone once recording starts.** The capture is a fixed
desktop rectangle. Moving it, resizing it, or letting anything cover it
**ends the recording** — everything up to that instant is kept, and the rest
would have been the wrong pixels. This is the trade the operator accepted in
[`s8-operator-waiver.json`](s8-operator-waiver.json): availability for
safety.

---

## Pre-flight — once, before the first recording

### 1. The machine can capture

Run from `C:\Users\adm.dennis.mitchell\source\repos\dabbler-ai-orchestration`:

```powershell
ffmpeg -version        # expect: ffmpeg version 9.0-full_build
ffprobe -version       # expect: ffprobe version 9.0-full_build
.venv\Scripts\python.exe -m ai_router.verify_type --confirm   # expect: COPILOT_CLI
```

`ffmpeg` and `ffprobe` are already on the **User** PATH here
(`...\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-9.0-full_build\bin`). A shell
that does not inherit the User environment will not see them — open a normal
PowerShell window, not an agent shell.

### 2. The capture gate is open

```powershell
cd tools\dabbler-ai-orchestration
node -e "console.log(require('./scripts/record-vscode-walkthrough.js').captureApproval('gdigrab').approved)"
```

Expect `true`. If it prints `false`, stop — the waiver is not being read and
nothing below will record.

### 3. The desktop is safe to photograph

This is the **cheap half** of
[`publication-safety-checklist.md`](../../walkthroughs/publication-safety-checklist.md),
and it removes most of what the per-video pass would otherwise have to
catch. On this machine, at the time this run-book was written, the following
were open and **all of them must be closed**: Outlook, Microsoft Teams,
Excel (`PatchStatus.xlsx`), PowerPoint, Word, Edge (a window titled
*"Pricing - Streamable and 26 more pages - Work"*), Notepad++, and the
Settings app.

- [ ] Close every application that is not the tutorial.
- [ ] **Turn Focus Assist / Do Not Disturb on.** Toasts render on top of
      everything and are the single most common leak.
- [ ] Clear the terminal scrollback, and check the prompt does not print the
      full path of a real project.
- [ ] Check the taskbar and system tray — pinned apps and badge counts are
      in frame.

### 4. Exactly one shipped VS Code window is open, or you name it

The harness **refuses to guess** between shipped VS Code windows, and that
refusal is correct. Either close the others, or disambiguate:

```powershell
node scripts\record-long-form.js start --set <slug> --session <N> --window-title-contains "unit-converter"
```

**Do not record this repo's own VS Code window.** The recording must be the
toy project (operator ruling, 2026-08-16: a purpose-built toy project, never
a real repository).

---

## The six recordings

Three session sets in the toy project `unit-converter`, two sessions each,
**one recording per session**. Sets 2 and 3 do not exist yet — they are cut
from the plan **on camera**, in Set 1 Session 2. That is the tutorial's
content, not a gap.

| # | recorder `--set` | what has to be on screen |
|---|---|---|
| 1 | `single-module-set-1` session 1 | A one-paragraph intent, the AI's plan, and **you disagreeing with part of it** — the first plan will probably put temperature with length and mass. The plan changes because you argued. |
| 2 | `single-module-set-1` session 2 | Cutting that plan into the two sets below, with prerequisites, and the sizing check: a session that would run over fifteen minutes gets split. |
| 3 | `single-module-set-2` session 1 | Length — metres, kilometres, miles, feet. A conversion table, a `convert()` entry point, tests. |
| 4 | `single-module-set-2` session 2 | Mass, **in the same shape as length** — the viewer is meant to see the second session reuse the first one's structure. |
| 5 | `single-module-set-3` session 1 | Temperature. The offsets break the multiply-by-a-factor shape, which is why the plan separated it. |
| 6 | `single-module-set-3` session 2 | One `convert` command over all three families, plus the failure cases (unknown unit; cross-family conversion). |

> **Recording 1 is the one the tutorial exists for.** A recording of a plan
> accepted unchanged teaches that the AI is right, which is not what this
> framework claims. If the first plan happens to be good, disagree with
> something real anyway — or re-run until there is something to argue about.

> **If a session runs past about fifteen minutes of wall clock, shrink the
> PROJECT, not the tutorial.** Dropping steps is how a lifecycle
> demonstration quietly stops demonstrating the lifecycle. This is a binding
> operator ruling.

### Per recording, the exact sequence

Everything below runs from `tools\dabbler-ai-orchestration` in this repo,
**except** the session itself, which runs in the toy project.

```powershell
# 1. START THE RECORDER (before the session)
node scripts\record-long-form.js start --set single-module-set-1 --session 1 --window-title-contains "unit-converter"
```

Expect `[long-form] RECORDING ...` plus the rectangle, the output path and
the start time. If it prints `FAILED TO START`, fix that now — an operator
who learns at the end of an hour that nothing was captured has lost the
hour.

```powershell
# 2. RUN THE SESSION, in the toy project's VS Code window.
#    start_session ... do the work ... close_session
```

```powershell
# 3. STOP THE RECORDER (after close_session)
node scripts\record-long-form.js stop --set single-module-set-1 --session 1 `
  --session-set-dir C:\Users\adm.dennis.mitchell\source\repos\unit-converter\docs\session-sets\001-plan-the-converter
```

**`--session-set-dir` is not optional here.** It defaults to
`docs/session-sets/<slug>` *in this repo*, and the session you just recorded
lives in the toy project. Without it the speed ramp has no timestamps to
read and silently skips. Point it at whatever the set directory is actually
called — Sets 2 and 3 get their slugs on camera, so use what the
decomposition produced.

Output lands in
`tools\dabbler-ai-orchestration\.walkthrough-runs\long-form\single-module-set-1-session-01\`:

| file | what it is |
|---|---|
| `single-module-set-1-session-01.mp4` | the raw recording |
| `single-module-set-1-session-01-ramped.mp4` | the speed-ramped one, if the ramp ran |
| `speed-ramp-plan.json` | the plan — **read it** |
| `capture-result.json` | duration, integrity, whether it was cut short |

> The harness zero-pads the session number (`-session-01`); the tutorial's
> example filename does not. The files on disk are the truth.

### Read the ramp plan before you trust the ramped file

This is the **first real exercise of the compression path** — Session 8 only
ever ran it against a 10.9-second smoke clip, where it correctly *refused* to
compress ("refusing to compress on no evidence"). So it is genuinely
unproven at length, and two outcomes are worth reporting rather than
working around:

- **It refuses.** Say so. Do not hand-edit a timeline.
- **It reports it is compressing nearly all of the recording.** It prints a
  loud `READ THE SEGMENTS` warning above 90%. That is the case where the
  framework wrote nothing for long stretches while a person sat reading the
  screen — and a person reading looks exactly like a suite running. **That is
  the one judgement the plan cannot make for you.**

Keep the raw file either way. The ramp never destroys it.

---

## Per video — the publication safety pass

Once per video, **with a human watching the video**, not once per batch and
not from memory:
[`publication-safety-checklist.md`](../../walkthroughs/publication-safety-checklist.md).

**"Do not publish this one" is a valid outcome**, and it is cheaper than
every alternative. Re-recording fifteen minutes costs fifteen minutes;
publishing a token does not.

Write one record per video into this set's directory as
`s9-publication-safety-<slug>-session-<N>.json`:

```json
{
  "video": "single-module-set-1-session-01.mp4",
  "reviewedBy": "<the human who watched it>",
  "reviewedAt": "<ISO-8601>",
  "decision": "publish",
  "findings": [],
  "notes": ""
}
```

A `publish` decision with a non-empty `findings` list needs one sentence per
finding saying why it was acceptable — that sentence is the whole value of
writing the record down.

---

## What to hand back

When the six are done, the orchestrator needs only these facts to finish the
session:

1. Which recordings exist, and their durations.
2. For each: what the ramp plan said — refused, applied, and the compressed
   percentage.
3. Whether any recording was **cut short** by the occlusion or window-move
   guard (`capture-result.json` → `integrity.aborted`), and what covered it.
4. The six safety-pass decisions.
5. Anything that had to change in the harness to get through it — that
   decides whether Layer 3 is owed at close (`L-064-12`).
